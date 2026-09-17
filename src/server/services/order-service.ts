import "server-only";
import { stripe } from "@/lib/stripe";
import { addressSchema, SHIPPING_COUNTRY, type AddressInput } from "@/lib/validations/checkout";
import { getCartWithItems, clearCartItems } from "@/server/data/cart";
import {
  createOrderFromCart,
  getOrderByIdForBuyer,
  markPaymentFailed,
  updateOrderPaymentSession,
} from "@/server/data/orders";

export type CheckoutResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; formError: string }
  | { ok: false; formError: string; failedOrderId: string };

const CHECKOUT_SESSION_TTL_SECONDS = 30 * 60; // Stripe requires >= 30 minutes

function baseUrl() {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

async function createStripeSessionForOrder(order: {
  id: string;
  sellerOrders: { items: { productNameSnapshot: string; unitPriceSnapshot: unknown; quantity: number }[] }[];
}) {
  const lineItems = order.sellerOrders.flatMap((so) =>
    so.items.map((item) => ({
      price_data: {
        currency: "ron",
        product_data: { name: item.productNameSnapshot },
        unit_amount: Math.round(Number(item.unitPriceSnapshot) * 100),
      },
      quantity: item.quantity,
    }))
  );

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    success_url: `${baseUrl()}/checkout/success?orderId=${order.id}`,
    cancel_url: `${baseUrl()}/checkout/failed?orderId=${order.id}`,
    metadata: { orderId: order.id },
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS,
  });
}

export async function checkoutCart(userId: string, buyerEmail: string, address: AddressInput): Promise<CheckoutResult> {
  const parsed = addressSchema.safeParse(address);
  if (!parsed.success) return { ok: false, formError: "Please fix the errors above and try again." };

  const { cart, items } = await getCartWithItems(userId);
  if (items.length === 0) return { ok: false, formError: "Your cart is empty." };

  const result = await createOrderFromCart({
    buyerId: userId,
    items: items.map((i) => ({ productVariantId: i.productVariantId, quantity: i.quantity })),
    shippingAddressSnapshot: { ...parsed.data, country: SHIPPING_COUNTRY },
  });

  if (!result.ok) {
    if (result.reason === "empty_cart") return { ok: false, formError: "Your cart is empty." };
    if (result.reason === "product_unavailable") {
      return { ok: false, formError: `"${result.productName}" is no longer available. Please remove it from your cart.` };
    }
    return {
      ok: false,
      formError: `Only ${result.available} of "${result.productName}" left in stock. Please update your cart.`,
    };
  }

  const { order } = result;

  try {
    const session = await createStripeSessionForOrder(order);
    await updateOrderPaymentSession(order.id, session.id);
    await clearCartItems(cart.id);
    return { ok: true, redirectUrl: session.url! };
  } catch {
    // Order tree already committed and stock already decremented — never lost, but payment
    // couldn't start. Mark it failed and hand the buyer a retry path rather than losing the order.
    await markPaymentFailed(order.id);
    return {
      ok: false,
      formError: "Couldn't start the payment. You can retry from your order.",
      failedOrderId: order.id,
    };
  }
}

export type RetryPaymentResult = { ok: true; redirectUrl: string } | { ok: false; formError: string };

export async function retryOrderPayment(userId: string, orderId: string): Promise<RetryPaymentResult> {
  const order = await getOrderByIdForBuyer(userId, orderId);
  if (!order) return { ok: false, formError: "Order not found." };
  if (order.payment?.status === "succeeded") {
    return { ok: false, formError: "This order has already been paid." };
  }

  try {
    const session = await createStripeSessionForOrder(order);
    await updateOrderPaymentSession(order.id, session.id);
    return { ok: true, redirectUrl: session.url! };
  } catch {
    return { ok: false, formError: "Couldn't start the payment. Please try again shortly." };
  }
}
