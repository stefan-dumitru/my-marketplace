import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { stripe } from "@/lib/stripe";
import { queueEmail } from "@/lib/email";
import { COUPON_FAILURE_MESSAGE, toCents } from "@/lib/coupons";
import { addressSchema, SHIPPING_COUNTRY, type AddressInput } from "@/lib/validations/checkout";
import { requestReturnSchema, type RequestReturnInput } from "@/lib/validations/return-request";
import { getCartWithItems, clearCartItems } from "@/server/data/cart";
import { setCartCoupon } from "@/server/data/coupons";
import {
  createOrderFromCart,
  getOrderByIdForBuyer,
  getOrderForNotification,
  markPaymentFailed,
  updateOrderPaymentSession,
} from "@/server/data/orders";
import { findReturnableSellerOrderForBuyer, createReturnRequest } from "@/server/data/return-requests";
import { notifyUser } from "@/server/services/notification-service";

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
  totalAmount: unknown;
  discountAmount: unknown;
  couponCodeSnapshot: string | null;
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

  // The discount goes to Stripe as a one-off fixed-amount coupon (Checkout can't take a negative
  // line item), so the amount Stripe charges equals Order.totalAmount to the cent. The order's own
  // frozen discountAmount is the source of truth — never the live Coupon row, which may have been
  // edited or deactivated since checkout started.
  const discountCents = toCents(Number(order.discountAmount));
  const grossCents = lineItems.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0);
  if (grossCents - discountCents !== toCents(Number(order.totalAmount))) {
    throw new Error(`Order ${order.id}: line items minus discount don't match the stored total`);
  }
  const stripeCoupon =
    discountCents > 0
      ? await stripe.coupons.create({
          amount_off: discountCents,
          currency: "ron",
          duration: "once",
          max_redemptions: 1,
          name: order.couponCodeSnapshot ?? "Discount",
        })
      : null;

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    ...(stripeCoupon ? { discounts: [{ coupon: stripeCoupon.id }] } : {}),
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
    couponId: cart.couponId,
  });

  if (!result.ok) {
    if (result.reason === "empty_cart") return { ok: false, formError: "Your cart is empty." };
    if (result.reason === "coupon_invalid") {
      // The code stopped being valid between "Apply" and "Pay" — drop it so the buyer sees the
      // real, undiscounted total on the next render instead of retrying into the same failure.
      await setCartCoupon(cart.id, null);
      return {
        ok: false,
        formError: `${COUPON_FAILURE_MESSAGE[result.couponReason]} Your code was removed — review your total and try again.`,
      };
    }
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

export type RequestReturnResult = { ok: true } | { ok: false; formError: string };

export async function requestReturn(
  buyerId: string,
  sellerOrderId: string,
  input: RequestReturnInput
): Promise<RequestReturnResult> {
  const parsed = requestReturnSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  const sellerOrder = await findReturnableSellerOrderForBuyer(buyerId, sellerOrderId);
  if (!sellerOrder) {
    return { ok: false, formError: "This order isn't eligible for a return request." };
  }

  try {
    await createReturnRequest(sellerOrderId, parsed.data.reason);
  } catch (err) {
    // Race-safe backstop behind the eligibility check above: two concurrent submits for the
    // same sub-order both pass the check, but only one can win the unique constraint.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, formError: "A return request has already been submitted for this order." };
    }
    throw err;
  }

  const sellerEmail = sellerOrder.seller.user.email;
  const title = "New return request";
  const body = `A buyer has requested a return for order ${sellerOrder.order.orderNumber}. Review it from your orders dashboard.`;
  await queueEmail({
    to: sellerEmail,
    subject: title,
    html: `<p>${body}</p>`,
    text: body,
  }).catch(() => {
    // Best-effort notification — see seller-service.ts's approveSellerApplication for the same
    // pattern: an email failure shouldn't fail an otherwise-successful request.
  });
  await notifyUser({
    userId: sellerOrder.seller.user.id,
    type: "return_request_submitted",
    title,
    body,
    link: `/seller/orders/${sellerOrderId}`,
  }).catch(() => {});

  return { ok: true };
}

/**
 * Called from the Stripe webhook's checkout.session.completed handler, gated there on the
 * payment update's own count so a webhook redelivery (which matches zero rows the second time)
 * can't double-notify — see that handler's existing idempotency comment.
 */
export async function notifyOrderConfirmed(orderId: string) {
  const order = await getOrderForNotification(orderId);
  if (!order) return;

  const buyerTitle = "Order confirmed";
  const buyerBody = `Your order ${order.orderNumber} has been paid and is being prepared by the seller(s).`;
  await queueEmail({
    to: order.buyer.email,
    subject: buyerTitle,
    html: `<p>${buyerBody}</p>`,
    text: buyerBody,
  }).catch(() => {});
  await notifyUser({
    userId: order.buyer.id,
    type: "order_confirmed",
    title: buyerTitle,
    body: buyerBody,
    link: `/orders/${order.id}`,
  }).catch(() => {});

  // One "new order" notification per seller sub-order, not per order — each seller only cares
  // about their own slice (see the per-seller fulfillment model this app uses throughout).
  await Promise.all(
    order.sellerOrders.map(async (sellerOrder) => {
      const sellerTitle = "New order received";
      const sellerBody = `You have a new order to fulfill (order ${order.orderNumber}).`;
      await queueEmail({
        to: sellerOrder.seller.user.email,
        subject: sellerTitle,
        html: `<p>${sellerBody}</p>`,
        text: sellerBody,
      }).catch(() => {});
      await notifyUser({
        userId: sellerOrder.seller.user.id,
        type: "seller_order_received",
        title: sellerTitle,
        body: sellerBody,
        link: `/seller/orders/${sellerOrder.id}`,
      }).catch(() => {});
    })
  );
}

/** Called from the Stripe webhook's checkout.session.expired handler, same redelivery guard as notifyOrderConfirmed. */
export async function notifyPaymentFailed(orderId: string) {
  const order = await getOrderForNotification(orderId);
  if (!order) return;

  const title = "Payment failed";
  const body = `Your payment for order ${order.orderNumber} didn't go through. You can retry from your order page.`;
  await queueEmail({
    to: order.buyer.email,
    subject: title,
    html: `<p>${body}</p>`,
    text: body,
  }).catch(() => {});
  await notifyUser({
    userId: order.buyer.id,
    type: "order_payment_failed",
    title,
    body,
    link: `/orders/${order.id}`,
  }).catch(() => {});
}
