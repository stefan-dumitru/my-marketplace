import { describe, expect, it, vi } from "vitest";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getCartWithItems } from "@/server/data/cart";
import {
  checkoutCart,
  notifyOrderConfirmed,
  notifyPaymentFailed,
  requestReturn,
} from "@/server/services/order-service";
import {
  createActiveProduct,
  createApprovedSeller,
  createBuyer,
  createCategory,
  deliverSellerOrder,
  placeOrder,
} from "@test/helpers";

const ADDRESS = {
  recipientName: "Test Buyer",
  line1: "Str. Exemplu 1",
  line2: "",
  city: "Cluj-Napoca",
  county: "Cluj",
  postalCode: "400001",
  phone: "0723456789",
};

async function productFrom(sellerId: string, categoryId: string, overrides: { price?: number; stockQty?: number; status?: "active" | "inactive" } = {}) {
  return createActiveProduct(sellerId, categoryId, { price: 100, stockQty: 5, ...overrides });
}

async function fillCart(userId: string, lines: { variantId: string; quantity: number }[]) {
  const { cart } = await getCartWithItems(userId);
  for (const line of lines) {
    await prisma.cartItem.create({ data: { cartId: cart.id, productVariantId: line.variantId, quantity: line.quantity } });
  }
  return cart;
}

describe("checkoutCart", () => {
  it("refuses an empty cart", async () => {
    const buyer = await createBuyer();
    expect(await checkoutCart(buyer.id, buyer.email, ADDRESS)).toEqual({ ok: false, formError: "Your cart is empty." });
  });

  it("refuses an incomplete address and creates no order", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const product = await productFrom(profile.id, (await createCategory()).id);
    await fillCart(buyer.id, [{ variantId: product.variants[0].id, quantity: 1 }]);

    const result = await checkoutCart(buyer.id, buyer.email, { ...ADDRESS, postalCode: "" });

    expect(result.ok).toBe(false);
    expect(await prisma.order.count()).toBe(0);
  });

  it("creates the order, hands Stripe the right session, clears the cart and reserves stock", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const product = await productFrom(profile.id, (await createCategory()).id, { price: 100, stockQty: 5 });
    const cart = await fillCart(buyer.id, [{ variantId: product.variants[0].id, quantity: 2 }]);

    const result = await checkoutCart(buyer.id, buyer.email, ADDRESS);

    expect(result).toEqual({ ok: true, redirectUrl: "https://stripe.test/pay" });
    const order = await prisma.order.findFirstOrThrow({ include: { payment: true } });
    expect(order.status).toBe("pending_payment");
    expect(order.payment?.stripePaymentIntentId).toBe("cs_test_mock");
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: product.variants[0].id } })).stockQty).toBe(3);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "payment", metadata: { orderId: order.id } })
    );
  });

  it("charges Stripe exactly the stored order total, goods plus one shipping line per seller", async () => {
    const buyer = await createBuyer();
    const category = await createCategory();
    const a = await createApprovedSeller();
    const b = await createApprovedSeller();
    const pa = await productFrom(a.profile.id, category.id, { price: 100 });
    const pb = await productFrom(b.profile.id, category.id, { price: 50 });
    await fillCart(buyer.id, [
      { variantId: pa.variants[0].id, quantity: 1 },
      { variantId: pb.variants[0].id, quantity: 2 },
    ]);

    await checkoutCart(buyer.id, buyer.email, ADDRESS);

    const order = await prisma.order.findFirstOrThrow();
    const args = firstSessionArgs();
    const chargedCents = args.line_items.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0);
    expect(chargedCents).toBe(Math.round(Number(order.totalAmount) * 100));
    expect(args.line_items.filter((li) => li.price_data.product_data.name.startsWith("Shipping"))).toHaveLength(2);
  });

  it("marks the order failed, keeps the cart and offers a retry when Stripe is down", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const product = await productFrom(profile.id, (await createCategory()).id);
    const cart = await fillCart(buyer.id, [{ variantId: product.variants[0].id, quantity: 1 }]);
    failNextSession();

    const result = await checkoutCart(buyer.id, buyer.email, ADDRESS);

    expect(result).toMatchObject({ ok: false, failedOrderId: expect.any(String) });
    const order = await prisma.order.findFirstOrThrow({ include: { payment: true } });
    expect(order.status).toBe("payment_failed");
    expect(order.payment?.status).toBe("failed");
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(1);
  });

  it("reports how much stock is left when the cart asks for more", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const product = await createActiveProduct(profile.id, (await createCategory()).id, { name: "Gadget", stockQty: 1 });
    await fillCart(buyer.id, [{ variantId: product.variants[0].id, quantity: 3 }]);

    const result = await checkoutCart(buyer.id, buyer.email, ADDRESS);

    expect(result).toEqual({ ok: false, formError: 'Only 1 of "Gadget" left in stock. Please update your cart.' });
    expect(await prisma.order.count()).toBe(0);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: product.variants[0].id } })).stockQty).toBe(1);
  });

  it("refuses a product that was deactivated after it went into the cart", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const product = await createActiveProduct(profile.id, (await createCategory()).id, { name: "Retired" });
    await fillCart(buyer.id, [{ variantId: product.variants[0].id, quantity: 1 }]);
    await prisma.product.update({ where: { id: product.id }, data: { status: "inactive" } });

    const result = await checkoutCart(buyer.id, buyer.email, ADDRESS);

    expect(result.ok).toBe(false);
    expect(await prisma.order.count()).toBe(0);
  });
});

describe("requestReturn", () => {
  async function deliveredOrder() {
    const seller = await createApprovedSeller();
    const buyer = await createBuyer();
    const product = await productFrom(seller.profile.id, (await createCategory()).id);
    const order = await placeOrder(buyer.id, [{ productVariantId: product.variants[0].id, quantity: 1 }]);
    const sellerOrder = await prisma.sellerOrder.findFirstOrThrow({ where: { orderId: order.id } });
    await deliverSellerOrder(sellerOrder.id);
    return { seller, buyer, sellerOrder };
  }

  it("records the request and tells the seller", async () => {
    const { seller, buyer, sellerOrder } = await deliveredOrder();

    const result = await requestReturn(buyer.id, sellerOrder.id, { reason: "The item arrived broken" });

    expect(result).toEqual({ ok: true });
    const request = await prisma.returnRequest.findUniqueOrThrow({ where: { sellerOrderId: sellerOrder.id } });
    expect(request.reason).toBe("The item arrived broken");
    expect(request.status).toBe("pending");
    expect(await prisma.notification.count({ where: { userId: seller.user.id, type: "return_request_submitted" } })).toBe(1);
  });

  it("allows only one request per seller order", async () => {
    const { buyer, sellerOrder } = await deliveredOrder();
    await requestReturn(buyer.id, sellerOrder.id, { reason: "The item arrived broken" });

    const second = await requestReturn(buyer.id, sellerOrder.id, { reason: "Still broken, please help" });

    expect(second.ok).toBe(false);
    expect(await prisma.returnRequest.count()).toBe(1);
  });

  it("will not let another buyer return someone else's order", async () => {
    const { sellerOrder } = await deliveredOrder();
    const stranger = await createBuyer();

    const result = await requestReturn(stranger.id, sellerOrder.id, { reason: "I want a refund please" });

    expect(result).toEqual({ ok: false, formError: "This order isn't eligible for a return request." });
    expect(await prisma.returnRequest.count()).toBe(0);
  });

  it("will not accept a return before delivery", async () => {
    const seller = await createApprovedSeller();
    const buyer = await createBuyer();
    const product = await productFrom(seller.profile.id, (await createCategory()).id);
    const order = await placeOrder(buyer.id, [{ productVariantId: product.variants[0].id, quantity: 1 }]);
    const sellerOrder = await prisma.sellerOrder.findFirstOrThrow({ where: { orderId: order.id } });

    const result = await requestReturn(buyer.id, sellerOrder.id, { reason: "Changed my mind early" });

    expect(result.ok).toBe(false);
  });

  it("requires a meaningful reason", async () => {
    const { buyer, sellerOrder } = await deliveredOrder();
    const result = await requestReturn(buyer.id, sellerOrder.id, { reason: "bad" });
    expect(result.ok).toBe(false);
    expect(await prisma.returnRequest.count()).toBe(0);
  });
});

describe("order notifications", () => {
  it("notifies the buyer once and each seller about their own slice", async () => {
    const category = await createCategory();
    const a = await createApprovedSeller();
    const b = await createApprovedSeller();
    const buyer = await createBuyer();
    const pa = await productFrom(a.profile.id, category.id);
    const pb = await productFrom(b.profile.id, category.id);
    const order = await placeOrder(buyer.id, [
      { productVariantId: pa.variants[0].id, quantity: 1 },
      { productVariantId: pb.variants[0].id, quantity: 1 },
    ]);

    await notifyOrderConfirmed(order.id);

    expect(await prisma.notification.count({ where: { userId: buyer.id, type: "order_confirmed" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: a.user.id, type: "seller_order_received" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: b.user.id, type: "seller_order_received" } })).toBe(1);
  });

  it("tells the buyer when payment failed", async () => {
    const { profile } = await createApprovedSeller();
    const buyer = await createBuyer();
    const product = await productFrom(profile.id, (await createCategory()).id);
    const order = await placeOrder(buyer.id, [{ productVariantId: product.variants[0].id, quantity: 1 }]);

    await notifyPaymentFailed(order.id);

    expect(await prisma.notification.count({ where: { userId: buyer.id, type: "order_payment_failed" } })).toBe(1);
  });

  it("quietly ignores an order that no longer exists", async () => {
    await expect(notifyOrderConfirmed("missing")).resolves.toBeUndefined();
    await expect(notifyPaymentFailed("missing")).resolves.toBeUndefined();
    expect(await prisma.notification.count()).toBe(0);
  });
});

// Typed accessors for the globally mocked Stripe session call.
type SessionArgs = {
  line_items: { price_data: { unit_amount: number; product_data: { name: string } }; quantity: number }[];
};
function firstSessionArgs(): SessionArgs {
  return vi.mocked(stripe.checkout.sessions.create).mock.calls[0][0] as unknown as SessionArgs;
}
function failNextSession() {
  vi.mocked(stripe.checkout.sessions.create).mockRejectedValueOnce(new Error("stripe down"));
}
