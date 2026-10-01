import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { COUPON_FAILURE_MESSAGE, COUPON_NOT_FOUND_MESSAGE } from "@/lib/coupons";
import { createOrderFromCart } from "@/server/data/orders";
import { reserveCouponRedemption } from "@/server/data/coupons";
import { getCartWithItems } from "@/server/data/cart";
import { checkoutCart } from "@/server/services/order-service";
import { cancelSellerOrder } from "@/server/services/seller-order-service";
import {
  applyCouponCode,
  createCouponForAdmin,
  resolveCartCoupon,
  setCouponActiveForAdmin,
  updateCouponForAdmin,
} from "@/server/services/coupon-service";
import type { CouponInput } from "@/lib/validations/coupon";
import {
  createAdmin,
  createApprovedSeller,
  createBuyer,
  createCategory,
  createActiveProduct,
  placeOrder,
} from "@test/helpers";

const ADDRESS = {
  recipientName: "Test Buyer",
  line1: "Str. Exemplu 1",
  line2: "",
  city: "București",
  county: "București",
  postalCode: "010101",
  phone: "0700000000",
};

async function makeCoupon(overrides: Record<string, unknown> = {}) {
  const admin = await createAdmin();
  return prisma.coupon.create({
    data: {
      code: `CODE${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      type: "percentage",
      value: 10,
      createdByUserId: admin.id,
      ...overrides,
    },
  });
}

async function productAt(price: number, stockQty = 10) {
  const { profile } = await createApprovedSeller();
  const category = await createCategory();
  const product = await createActiveProduct(profile.id, category.id, { price, stockQty });
  return { profile, product, variantId: product.variants[0].id };
}

async function fillCart(userId: string, lines: { variantId: string; quantity: number }[]) {
  const { cart } = await getCartWithItems(userId);
  for (const line of lines) {
    await prisma.cartItem.create({ data: { cartId: cart.id, productVariantId: line.variantId, quantity: line.quantity } });
  }
  return cart;
}

const order = (buyerId: string, variantIds: string[], couponId?: string) =>
  createOrderFromCart({
    buyerId,
    items: variantIds.map((productVariantId) => ({ productVariantId, quantity: 1 })),
    shippingAddressSnapshot: ADDRESS,
    couponId,
  });

describe("createOrderFromCart with a coupon", () => {
  it("discounts the buyer's total but leaves every seller's subtotal, commission and payout untouched", async () => {
    const a = await productAt(100);
    const b = await productAt(100);
    const coupon = await makeCoupon({ value: 10 });
    const withCoupon = await createBuyer();
    const baseline = await createBuyer();

    const discounted = await order(withCoupon.id, [a.variantId, b.variantId], coupon.id);
    const plain = await order(baseline.id, [a.variantId, b.variantId]);
    if (!discounted.ok || !plain.ok) throw new Error("setup failed");

    // Goods 200 - 20 discount + 2 x 15 shipping (the discount never touches shipping).
    expect(Number(discounted.order.totalAmount)).toBe(210);
    expect(Number(discounted.order.discountAmount)).toBe(20);
    expect(discounted.order.couponCodeSnapshot).toBe(coupon.code);
    expect(Number(discounted.order.payment?.amount)).toBe(210);

    const allocated = discounted.order.sellerOrders.map((so) => Number(so.discountAllocated));
    expect(allocated.reduce((x, y) => x + y, 0)).toBe(20);

    for (const so of discounted.order.sellerOrders) {
      const twin = plain.order.sellerOrders.find((p) => p.sellerId === so.sellerId)!;
      expect(Number(so.subtotal)).toBe(Number(twin.subtotal));
      expect(Number(so.commissionAmount)).toBe(Number(twin.commissionAmount));
      expect(Number(so.payoutAmount)).toBe(Number(twin.payoutAmount));
    }

    const redemptions = await prisma.couponRedemption.findMany({ where: { couponId: coupon.id } });
    expect(redemptions).toHaveLength(1);
    expect(Number(redemptions[0].discountAmount)).toBe(20);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redemptionCount).toBe(1);
  });

  it("allocates an odd discount across sub-orders to the exact cent", async () => {
    const a = await productAt(33.33);
    const b = await productAt(33.33);
    const c = await productAt(33.34);
    const coupon = await makeCoupon({ type: "fixed_amount", value: 1 });
    const buyer = await createBuyer();

    const result = await order(buyer.id, [a.variantId, b.variantId, c.variantId], coupon.id);
    if (!result.ok) throw new Error("setup failed");

    const cents = result.order.sellerOrders.map((so) => Math.round(Number(so.discountAllocated) * 100));
    expect(cents.reduce((x, y) => x + y, 0)).toBe(100);
    // Goods 99.00 + 3 x 15.00 shipping.
    expect(Math.round(Number(result.order.totalAmount) * 100)).toBe(9_900 + 4_500);
  });

  it("rolls back the stock decrement and creates no order when the coupon has expired", async () => {
    const { variantId } = await productAt(100, 10);
    const coupon = await makeCoupon({ expiresAt: new Date(Date.now() - 60_000) });
    const buyer = await createBuyer();

    const result = await order(buyer.id, [variantId], coupon.id);

    expect(result).toMatchObject({ ok: false, reason: "coupon_invalid", couponReason: "expired" });
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQty).toBe(10);
    expect(await prisma.order.count()).toBe(0);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redemptionCount).toBe(0);
  });

  it("never over-redeems the last remaining use when two buyers race for it", async () => {
    // Separate products on purpose: a shared variant would serialize the two checkouts on the
    // stock row's lock and the coupon guard would never actually be exercised.
    const one = await productAt(100, 10);
    const two = await productAt(100, 10);
    const coupon = await makeCoupon({ maxRedemptionsTotal: 1 });
    const [first, second] = await Promise.all([createBuyer(), createBuyer()]);

    const results = await Promise.all([
      order(first.id, [one.variantId], coupon.id),
      order(second.id, [two.variantId], coupon.id),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const loser = results.find((r) => !r.ok);
    expect(loser).toMatchObject({ reason: "coupon_invalid", couponReason: "limit_reached" });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redemptionCount).toBe(1);
    expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(1);
    // Only the winner's unit was taken — the loser's whole transaction, stock included, rolled back.
    const stocks = await prisma.productVariant.findMany({ where: { id: { in: [one.variantId, two.variantId] } } });
    expect(stocks.map((v) => v.stockQty).sort((x, y) => x - y)).toEqual([9, 10]);
  });

  it("enforces the per-buyer limit when the same buyer checks out twice at once", async () => {
    const one = await productAt(100, 10);
    const two = await productAt(100, 10);
    const coupon = await makeCoupon({ maxRedemptionsPerUser: 1 });
    const buyer = await createBuyer();

    const results = await Promise.all([
      order(buyer.id, [one.variantId], coupon.id),
      order(buyer.id, [two.variantId], coupon.id),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ couponReason: "user_limit_reached" });
    expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(1);
  });

  it("rejects a first-order-only code for a buyer who already has a paid order", async () => {
    const { variantId } = await productAt(100, 10);
    const coupon = await makeCoupon({ firstOrderOnly: true });
    const buyer = await createBuyer();
    const earlier = await placeOrder(buyer.id, [{ productVariantId: variantId, quantity: 1 }]);
    await prisma.order.update({ where: { id: earlier.id }, data: { status: "paid" } });

    const result = await order(buyer.id, [variantId], coupon.id);

    expect(result).toMatchObject({ ok: false, couponReason: "first_order_only" });
  });
});

describe("reserveCouponRedemption (the atomic guard)", () => {
  const reserve = (couponId: string) => prisma.$transaction((tx) => reserveCouponRedemption(tx, couponId));

  it("reserves while under the limit and counts the use", async () => {
    const coupon = await makeCoupon({ maxRedemptionsTotal: 2 });

    expect(await reserve(coupon.id)).toBe(true);
    expect(await reserve(coupon.id)).toBe(true);
    expect(await reserve(coupon.id)).toBe(false);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redemptionCount).toBe(2);
  });

  it("refuses an inactive, expired or not-yet-started coupon", async () => {
    const inactive = await makeCoupon({ isActive: false });
    const expired = await makeCoupon({ expiresAt: new Date(Date.now() - 1_000) });
    const future = await makeCoupon({ startsAt: new Date(Date.now() + 3_600_000) });

    expect(await reserve(inactive.id)).toBe(false);
    expect(await reserve(expired.id)).toBe(false);
    expect(await reserve(future.id)).toBe(false);
  });

  it("lets an unlimited coupon be reserved any number of times", async () => {
    const coupon = await makeCoupon({ maxRedemptionsTotal: null });

    const results = await Promise.all(Array.from({ length: 5 }, () => reserve(coupon.id)));

    expect(results.every(Boolean)).toBe(true);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redemptionCount).toBe(5);
  });

  it("never exceeds the limit when many reservations race", async () => {
    const coupon = await makeCoupon({ maxRedemptionsTotal: 3 });

    const results = await Promise.all(Array.from({ length: 8 }, () => reserve(coupon.id)));

    expect(results.filter(Boolean)).toHaveLength(3);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redemptionCount).toBe(3);
  });
});

describe("applyCouponCode and resolveCartCoupon", () => {
  it("applies a code case-insensitively and selects it on the cart", async () => {
    const { variantId } = await productAt(100);
    const coupon = await makeCoupon({ code: "SUMMER10" });
    const buyer = await createBuyer();
    await fillCart(buyer.id, [{ variantId, quantity: 1 }]);

    const result = await applyCouponCode(buyer.id, "  summer10 ");

    expect(result).toEqual({ ok: true });
    expect((await prisma.cart.findUniqueOrThrow({ where: { userId: buyer.id } })).couponId).toBe(coupon.id);
  });

  it("gives an unknown code and a deactivated code the identical message", async () => {
    const { variantId } = await productAt(100);
    await makeCoupon({ code: "OFFLINE", isActive: false });
    const buyer = await createBuyer();
    await fillCart(buyer.id, [{ variantId, quantity: 1 }]);

    const unknown = await applyCouponCode(buyer.id, "NOPE1234");
    const inactive = await applyCouponCode(buyer.id, "OFFLINE");

    expect(unknown).toEqual({ ok: false, formError: COUPON_NOT_FOUND_MESSAGE });
    expect(inactive).toEqual(unknown);
  });

  it("refuses an empty cart and a below-minimum cart with specific messages", async () => {
    const { variantId } = await productAt(100);
    await makeCoupon({ code: "BIGSPEND", minOrderAmount: 500 });
    const buyer = await createBuyer();

    expect(await applyCouponCode(buyer.id, "BIGSPEND")).toEqual({ ok: false, formError: "Your cart is empty." });

    await fillCart(buyer.id, [{ variantId, quantity: 1 }]);
    expect(await applyCouponCode(buyer.id, "BIGSPEND")).toEqual({
      ok: false,
      formError: COUPON_FAILURE_MESSAGE.min_order,
    });
  });

  it("explains an already-used code that is held by the buyer's own unpaid order", async () => {
    const { variantId } = await productAt(100);
    const coupon = await makeCoupon({ code: "ONCE", maxRedemptionsPerUser: 1 });
    const buyer = await createBuyer();
    await order(buyer.id, [variantId], coupon.id); // order stays pending_payment
    await fillCart(buyer.id, [{ variantId, quantity: 1 }]);

    const result = await applyCouponCode(buyer.id, "ONCE");

    expect(result).toMatchObject({ ok: false });
    expect((result as { formError: string }).formError).toMatch(/unpaid order/i);
  });

  it("drops the code from the cart once the cart no longer qualifies", async () => {
    const { variantId } = await productAt(100);
    await makeCoupon({ code: "OVER150", minOrderAmount: 150 });
    const buyer = await createBuyer();
    const cart = await fillCart(buyer.id, [{ variantId, quantity: 2 }]);
    expect((await applyCouponCode(buyer.id, "OVER150")).ok).toBe(true);

    await prisma.cartItem.updateMany({ where: { cartId: cart.id }, data: { quantity: 1 } });
    const { cart: fresh, items } = await getCartWithItems(buyer.id);
    const state = await resolveCartCoupon(buyer.id, fresh, items);

    expect(state.status).toBe("dropped");
    expect((await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } })).couponId).toBeNull();
  });
});

describe("checkoutCart with a coupon", () => {
  it("charges Stripe exactly the discounted total and consumes the code", async () => {
    const { variantId } = await productAt(100);
    await makeCoupon({ code: "THIRTY", type: "fixed_amount", value: 30 });
    const buyer = await createBuyer();
    await fillCart(buyer.id, [{ variantId, quantity: 2 }]);
    await applyCouponCode(buyer.id, "THIRTY");

    const result = await checkoutCart(buyer.id, buyer.email, ADDRESS);

    expect(result).toEqual({ ok: true, redirectUrl: "https://stripe.test/pay" });
    expect(stripe.coupons.create).toHaveBeenCalledWith(expect.objectContaining({ amount_off: 3_000, currency: "ron", duration: "once" }));
    const [params] = vi.mocked(stripe.checkout.sessions.create).mock.calls[0] as unknown as [
      { line_items: { price_data: { unit_amount: number }; quantity: number }[]; discounts: { coupon: string }[] },
    ];
    expect(params.discounts).toEqual([{ coupon: "co_test_mock" }]);
    const gross = params.line_items.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0);
    const placed = await prisma.order.findFirstOrThrow({ where: { buyerId: buyer.id } });
    expect(gross - 3_000).toBe(Math.round(Number(placed.totalAmount) * 100));
    expect(Number(placed.totalAmount)).toBe(185); // 200 - 30 discount + 15 shipping

    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: buyer.id } });
    expect(cart.couponId).toBeNull();
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
  });

  it("sends no discount to Stripe when no code is applied", async () => {
    const { variantId } = await productAt(100);
    const buyer = await createBuyer();
    await fillCart(buyer.id, [{ variantId, quantity: 1 }]);

    await checkoutCart(buyer.id, buyer.email, ADDRESS);

    expect(stripe.coupons.create).not.toHaveBeenCalled();
    const [params] = vi.mocked(stripe.checkout.sessions.create).mock.calls[0] as unknown as [{ discounts?: unknown }];
    expect(params.discounts).toBeUndefined();
  });

  it("drops a code that was deactivated after it was applied, without placing an order", async () => {
    const { variantId } = await productAt(100, 10);
    const coupon = await makeCoupon({ code: "FLASH" });
    const buyer = await createBuyer();
    await fillCart(buyer.id, [{ variantId, quantity: 1 }]);
    await applyCouponCode(buyer.id, "FLASH");
    await prisma.coupon.update({ where: { id: coupon.id }, data: { isActive: false } });

    const result = await checkoutCart(buyer.id, buyer.email, ADDRESS);

    expect(result).toMatchObject({ ok: false });
    expect((result as { formError: string }).formError).toContain(COUPON_FAILURE_MESSAGE.inactive);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(await prisma.order.count()).toBe(0);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQty).toBe(10);
    expect((await prisma.cart.findUniqueOrThrow({ where: { userId: buyer.id } })).couponId).toBeNull();
  });
});

describe("refunds on a discounted order", () => {
  it("refunds a cancelled sub-order exactly what the buyer paid for it", async () => {
    const a = await productAt(100);
    const b = await productAt(100);
    const coupon = await makeCoupon({ value: 10 });
    const buyer = await createBuyer();
    const admin = await createAdmin();
    const placed = await order(buyer.id, [a.variantId, b.variantId], coupon.id);
    if (!placed.ok) throw new Error("setup failed");
    await prisma.payment.update({ where: { orderId: placed.order.id }, data: { stripePaymentIntentId: "pi_test", status: "succeeded" } });
    const target = placed.order.sellerOrders.find((so) => so.sellerId === a.profile.id)!;
    await prisma.sellerOrder.update({ where: { id: target.id }, data: { status: "confirmed" } });

    const result = await cancelSellerOrder(a.profile.id, target.id, admin.id);

    expect(result).toEqual({ ok: true });
    // 100 subtotal - 10 (its half of the 20 discount) + 15 shipping it paid = 105.00 RON.
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_test", amount: 10_500 }),
      expect.anything()
    );
  });
});

describe("admin coupon management", () => {
  const input: CouponInput = {
    code: "WELCOME15",
    type: "percentage",
    value: 15,
    minOrderAmount: undefined,
    maxDiscountAmount: 50,
    startsAt: "2026-01-01",
    expiresAt: "2026-12-31",
    maxRedemptionsTotal: 100,
    maxRedemptionsPerUser: 1,
    firstOrderOnly: true,
    isActive: true,
  };

  it("creates a coupon, treats the end date as inclusive, and writes an audit log", async () => {
    const admin = await createAdmin();

    expect(await createCouponForAdmin(input, admin.id)).toEqual({ ok: true });

    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code: "WELCOME15" } });
    expect(coupon.expiresAt?.toISOString()).toBe("2026-12-31T23:59:59.999Z");
    expect(coupon.startsAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityType: "Coupon", entityId: coupon.id } });
    expect(log).toMatchObject({ action: "coupon_created", actorUserId: admin.id });
  });

  it("rejects a duplicate code", async () => {
    const admin = await createAdmin();
    await createCouponForAdmin(input, admin.id);

    const result = await createCouponForAdmin(input, admin.id);

    expect(result).toEqual({ ok: false, fieldErrors: { code: "A coupon with this code already exists." } });
  });

  it("locks type and value once redeemed, but still lets the admin extend the expiry", async () => {
    const admin = await createAdmin();
    await createCouponForAdmin(input, admin.id);
    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code: "WELCOME15" } });
    await prisma.coupon.update({ where: { id: coupon.id }, data: { redemptionCount: 1 } });

    const blocked = await updateCouponForAdmin(coupon.id, { ...input, value: 90 }, admin.id);
    const allowed = await updateCouponForAdmin(coupon.id, { ...input, expiresAt: "2027-06-30" }, admin.id);

    expect(blocked).toMatchObject({ ok: false });
    expect(allowed).toEqual({ ok: true });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).expiresAt?.toISOString()).toBe(
      "2027-06-30T23:59:59.999Z"
    );
  });

  it("refuses to rename a coupon's code", async () => {
    const admin = await createAdmin();
    await createCouponForAdmin(input, admin.id);
    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code: "WELCOME15" } });

    const result = await updateCouponForAdmin(coupon.id, { ...input, code: "RENAMED" }, admin.id);

    expect(result).toMatchObject({ ok: false, fieldErrors: { code: expect.any(String) } });
  });

  it("deactivates and reactivates with audit entries", async () => {
    const admin = await createAdmin();
    await createCouponForAdmin(input, admin.id);
    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code: "WELCOME15" } });

    await setCouponActiveForAdmin(coupon.id, false, admin.id);
    await setCouponActiveForAdmin(coupon.id, true, admin.id);

    const actions = (await prisma.auditLog.findMany({ where: { entityId: coupon.id }, orderBy: { createdAt: "asc" } })).map(
      (l) => l.action
    );
    expect(actions).toEqual(["coupon_created", "coupon_deactivated", "coupon_activated"]);
  });
});
