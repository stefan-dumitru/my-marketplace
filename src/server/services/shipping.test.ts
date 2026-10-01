import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { SHIPPING_FEE_PER_SELLER } from "@/lib/constants";
import { shippingCentsForSellerCount } from "@/lib/shipping";
import { getCartWithItems } from "@/server/data/cart";
import { createOrderFromCart } from "@/server/data/orders";
import { checkoutCart, retryOrderPayment } from "@/server/services/order-service";
import { cancelSellerOrder, resolveReturn } from "@/server/services/seller-order-service";
import { createActiveProduct, createAdmin, createApprovedSeller, createBuyer, createCategory } from "@test/helpers";

const ADDRESS = {
  recipientName: "Test Buyer",
  line1: "Str. Exemplu 1",
  line2: "",
  city: "București",
  county: "București",
  postalCode: "010101",
  phone: "0700000000",
};

async function seller(price: number) {
  const { profile } = await createApprovedSeller();
  const category = await createCategory();
  const product = await createActiveProduct(profile.id, category.id, { price, stockQty: 20 });
  return { profile, variantId: product.variants[0].id };
}

const place = (buyerId: string, variantIds: string[], couponId?: string) =>
  createOrderFromCart({
    buyerId,
    items: variantIds.map((productVariantId) => ({ productVariantId, quantity: 1 })),
    shippingAddressSnapshot: ADDRESS,
    couponId,
  });

type StripeParams = {
  line_items: { price_data: { unit_amount: number; product_data: { name: string } }; quantity: number }[];
};

describe("shipping math", () => {
  it("charges one flat fee per seller", () => {
    expect(shippingCentsForSellerCount(0)).toBe(0);
    expect(shippingCentsForSellerCount(1)).toBe(SHIPPING_FEE_PER_SELLER * 100);
    expect(shippingCentsForSellerCount(3)).toBe(SHIPPING_FEE_PER_SELLER * 300);
  });
});

describe("shipping on an order", () => {
  it("adds one fee per seller to the total and freezes it on each sub-order", async () => {
    const a = await seller(100);
    const b = await seller(50);
    const buyer = await createBuyer();

    const result = await place(buyer.id, [a.variantId, b.variantId]);
    if (!result.ok) throw new Error("setup failed");

    expect(Number(result.order.shippingAmount)).toBe(2 * SHIPPING_FEE_PER_SELLER);
    expect(Number(result.order.totalAmount)).toBe(150 + 2 * SHIPPING_FEE_PER_SELLER);
    for (const so of result.order.sellerOrders) {
      expect(Number(so.shippingFee)).toBe(SHIPPING_FEE_PER_SELLER);
      expect(Number(so.shippingCharged)).toBe(SHIPPING_FEE_PER_SELLER);
    }
  });

  it("pays the seller the full fee with no commission taken on it", async () => {
    const a = await seller(100);
    const buyer = await createBuyer();

    const result = await place(buyer.id, [a.variantId]);
    if (!result.ok) throw new Error("setup failed");

    const so = result.order.sellerOrders[0];
    expect(Number(so.commissionAmount)).toBeCloseTo(10, 2); // 10% of goods only
    expect(Number(so.payoutAmount)).toBeCloseTo(100 - 10 + SHIPPING_FEE_PER_SELLER, 2);
  });

  it("never discounts shipping: a coupon only reduces the goods portion", async () => {
    const a = await seller(100);
    const admin = await createAdmin();
    const coupon = await prisma.coupon.create({
      data: { code: "SHIPTEST", type: "percentage", value: 50, createdByUserId: admin.id },
    });
    const buyer = await createBuyer();

    const result = await place(buyer.id, [a.variantId], coupon.id);
    if (!result.ok) throw new Error("setup failed");

    expect(Number(result.order.discountAmount)).toBe(50);
    expect(Number(result.order.shippingAmount)).toBe(SHIPPING_FEE_PER_SELLER);
    expect(Number(result.order.totalAmount)).toBe(100 - 50 + SHIPPING_FEE_PER_SELLER);
    // The seller's payout is unaffected by the platform-funded coupon.
    expect(Number(result.order.sellerOrders[0].payoutAmount)).toBeCloseTo(100 - 10 + SHIPPING_FEE_PER_SELLER, 2);
  });
});

describe("Stripe session with shipping", () => {
  async function checkoutTwoSellers() {
    const a = await seller(100);
    const b = await seller(50);
    const buyer = await createBuyer();
    const { cart } = await getCartWithItems(buyer.id);
    for (const v of [a.variantId, b.variantId]) {
      await prisma.cartItem.create({ data: { cartId: cart.id, productVariantId: v, quantity: 1 } });
    }
    const result = await checkoutCart(buyer.id, buyer.email, ADDRESS);
    return { buyer, result };
  }

  it("adds one 'Shipping' line item per seller and charges exactly the stored total", async () => {
    const { buyer, result } = await checkoutTwoSellers();

    expect(result).toMatchObject({ ok: true });
    const [params] = vi.mocked(stripe.checkout.sessions.create).mock.calls[0] as unknown as [StripeParams];
    const shippingLines = params.line_items.filter((li) => li.price_data.product_data.name.startsWith("Shipping"));
    expect(shippingLines).toHaveLength(2);
    expect(shippingLines.every((li) => li.price_data.unit_amount === SHIPPING_FEE_PER_SELLER * 100)).toBe(true);

    const charged = params.line_items.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0);
    const order = await prisma.order.findFirstOrThrow({ where: { buyerId: buyer.id } });
    expect(charged).toBe(Math.round(Number(order.totalAmount) * 100));
  });

  it("omits the shipping line for a sub-order whose fee was waived", async () => {
    const a = await seller(100);
    const buyer = await createBuyer();
    const placed = await place(buyer.id, [a.variantId]);
    if (!placed.ok) throw new Error("setup failed");
    // Simulate a waived fee: buyer pays 0 shipping, order total reduced accordingly.
    await prisma.sellerOrder.updateMany({ where: { orderId: placed.order.id }, data: { shippingCharged: 0 } });
    await prisma.order.update({ where: { id: placed.order.id }, data: { shippingAmount: 0, totalAmount: 100 } });
    await prisma.payment.update({ where: { orderId: placed.order.id }, data: { amount: 100 } });

    const result = await retryOrderPayment(buyer.id, placed.order.id);

    expect(result).toMatchObject({ ok: true });
    const [params] = vi.mocked(stripe.checkout.sessions.create).mock.calls[0] as unknown as [StripeParams];
    expect(params.line_items.some((li) => li.price_data.product_data.name.startsWith("Shipping"))).toBe(false);
    expect(params.line_items.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0)).toBe(10_000);
  });
});

describe("refunds with shipping", () => {
  async function paidOrder(status: "confirmed" | "delivered") {
    const a = await seller(100);
    const buyer = await createBuyer();
    const placed = await place(buyer.id, [a.variantId]);
    if (!placed.ok) throw new Error("setup failed");
    await prisma.payment.update({
      where: { orderId: placed.order.id },
      data: { stripePaymentIntentId: "pi_ship", status: "succeeded" },
    });
    const so = placed.order.sellerOrders[0];
    await prisma.sellerOrder.update({
      where: { id: so.id },
      data: { status, ...(status === "delivered" ? { deliveredAt: new Date() } : {}) },
    });
    return { sellerId: a.profile.id, sellerOrderId: so.id };
  }

  it("refunds goods plus the shipping the buyer paid when a sub-order is cancelled", async () => {
    const { sellerId, sellerOrderId } = await paidOrder("confirmed");
    const admin = await createAdmin();

    expect(await cancelSellerOrder(sellerId, sellerOrderId, admin.id)).toEqual({ ok: true });

    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10_000 + SHIPPING_FEE_PER_SELLER * 100 }),
      expect.anything()
    );
  });

  it("refunds goods only when a return is approved", async () => {
    const { sellerId, sellerOrderId } = await paidOrder("delivered");
    const admin = await createAdmin();
    await prisma.returnRequest.create({ data: { sellerOrderId, reason: "Not as described" } });

    expect(await resolveReturn(sellerId, sellerOrderId, admin.id, "approved")).toEqual({ ok: true });

    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10_000 }),
      expect.anything()
    );
  });

  it("never refunds more than the buyer paid, across cancel of every sub-order", async () => {
    const a = await seller(100);
    const b = await seller(33.33);
    const buyer = await createBuyer();
    const admin = await createAdmin();
    const placed = await place(buyer.id, [a.variantId, b.variantId]);
    if (!placed.ok) throw new Error("setup failed");
    await prisma.payment.update({ where: { orderId: placed.order.id }, data: { stripePaymentIntentId: "pi_all", status: "succeeded" } });
    await prisma.sellerOrder.updateMany({ where: { orderId: placed.order.id }, data: { status: "confirmed" } });

    for (const so of placed.order.sellerOrders) await cancelSellerOrder(so.sellerId, so.id, admin.id);

    const refunded = vi
      .mocked(stripe.refunds.create)
      .mock.calls.reduce((sum, [params]) => sum + Number((params as { amount: number }).amount), 0);
    expect(refunded).toBe(Math.round(Number(placed.order.totalAmount) * 100));
  });
});
