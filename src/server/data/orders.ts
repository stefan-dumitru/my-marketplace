import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { inngest } from "@/lib/inngest";
import { logger } from "@/lib/logger";
import { allocateDiscountCents, evaluateCoupon, fromCents, toCents, type CouponFailure } from "@/lib/coupons";
import {
  couponToRules,
  getCouponById,
  getCouponUsageForUser,
  reserveCouponRedemption,
} from "@/server/data/coupons";

const ORDER_INCLUDE = {
  sellerOrders: {
    include: {
      seller: { select: { storeName: true, storeSlug: true } },
      items: { include: { review: true } },
      returnRequest: { select: { status: true, reason: true } },
    },
  },
  payment: true,
} as const;

/** Internal — unwinds the transaction with enough detail to build a user-facing message. */
class CheckoutError extends Error {
  constructor(
    public reason: "product_unavailable" | "insufficient_stock",
    public productName: string,
    public available?: number
  ) {
    super(reason);
  }
}

/** Internal — a coupon that stopped being valid between "Apply" and "Pay". Throwing from inside
 * the transaction is what rolls back the stock decrement and the redemption reservation with it. */
class CouponRejectedError extends Error {
  constructor(public couponReason: CouponFailure) {
    super(couponReason);
  }
}

async function generateUniqueOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    const existing = await tx.order.findUnique({ where: { orderNumber: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique order number.");
}

export type CreateOrderFromCartResult =
  | { ok: true; order: NonNullable<Awaited<ReturnType<typeof getOrderByIdForBuyer>>> }
  | { ok: false; reason: "empty_cart" }
  | { ok: false; reason: "coupon_invalid"; couponReason: CouponFailure }
  | { ok: false; reason: "product_unavailable"; productName: string }
  | { ok: false; reason: "insufficient_stock"; productName: string; available: number };

/**
 * The core checkout transaction: atomically decrements stock (the actual concurrency guard —
 * distinct from this codebase's ownership verify-then-update pattern, since stock is a hot,
 * concurrently-written counter, not a racy ownership check) and creates the full Order tree in
 * one interactive transaction. Stripe is deliberately NOT called from in here — never hold a DB
 * transaction open across a network call — see order-service.ts's checkoutCart for what happens
 * after this commits.
 */
export async function createOrderFromCart(input: {
  buyerId: string;
  items: { productVariantId: string; quantity: number }[];
  shippingAddressSnapshot: Prisma.InputJsonValue;
  /** Optional promo code selection. Never trusted: re-validated and reserved in the transaction. */
  couponId?: string | null;
}): Promise<CreateOrderFromCartResult> {
  if (input.items.length === 0) return { ok: false, reason: "empty_cart" };

  try {
    const orderResult = await prisma.$transaction(async (tx) => {
      const variantIds = input.items.map((i) => i.productVariantId);
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: {
          product: {
            include: {
              category: { select: { defaultCommissionRate: true } },
              seller: { select: { id: true, commissionRateOverride: true } },
            },
          },
        },
      });
      const variantMap = new Map(variants.map((v) => [v.id, v]));

      type ItemCompute = {
        sellerId: string;
        productVariantId: string;
        productNameSnapshot: string;
        unitPriceSnapshot: number;
        quantity: number;
        lineTotal: number;
        commissionRate: number;
      };
      const computed: ItemCompute[] = [];
      const newlyLowStock: { sellerId: string; productId: string; productName: string; remaining: number }[] = [];

      for (const cartItem of input.items) {
        const variant = variantMap.get(cartItem.productVariantId);
        if (!variant || variant.product.status !== "active") {
          throw new CheckoutError(
            "product_unavailable",
            variant?.product.name ?? "An item in your cart"
          );
        }

        // The actual concurrency guard: atomic conditional decrement, not a read-then-write.
        const decremented = await tx.productVariant.updateMany({
          where: { id: variant.id, stockQty: { gte: cartItem.quantity } },
          data: { stockQty: { decrement: cartItem.quantity } },
        });
        if (decremented.count !== 1) {
          throw new CheckoutError("insufficient_stock", variant.product.name, variant.stockQty);
        }

        const remaining = variant.stockQty - cartItem.quantity;
        if (remaining <= LOW_STOCK_THRESHOLD) {
          // Same atomic-conditional-update trick as the stock decrement above: only the checkout
          // that actually crosses the threshold "wins" (count === 1), so a low-stock alert fires
          // once per dip, not once per sale while stock stays low, even under concurrent checkouts.
          const flagged = await tx.productVariant.updateMany({
            where: { id: variant.id, lowStockAlertedAt: null },
            data: { lowStockAlertedAt: new Date() },
          });
          if (flagged.count === 1) {
            newlyLowStock.push({
              sellerId: variant.product.seller.id,
              productId: variant.productId,
              productName: variant.product.name,
              remaining,
            });
          }
        }

        const unitPrice = Number(variant.price);
        computed.push({
          sellerId: variant.product.seller.id,
          productVariantId: variant.id,
          productNameSnapshot: variant.product.name,
          unitPriceSnapshot: unitPrice,
          quantity: cartItem.quantity,
          lineTotal: unitPrice * cartItem.quantity,
          commissionRate: Number(
            variant.product.seller.commissionRateOverride ?? variant.product.category.defaultCommissionRate
          ),
        });
      }

      const bySeller = new Map<string, ItemCompute[]>();
      for (const item of computed) {
        if (!bySeller.has(item.sellerId)) bySeller.set(item.sellerId, []);
        bySeller.get(item.sellerId)!.push(item);
      }

      const sellerOrdersData = Array.from(bySeller.entries()).map(([sellerId, items]) => {
        const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
        const commissionAmount = items.reduce((sum, i) => sum + i.lineTotal * i.commissionRate, 0);
        return {
          sellerId,
          subtotal,
          commissionAmount,
          // Frozen at sale time alongside commissionAmount, same invariant — never
          // retroactively recomputed later at payout time.
          payoutAmount: subtotal - commissionAmount,
          items: {
            create: items.map((i) => ({
              productVariantId: i.productVariantId,
              productNameSnapshot: i.productNameSnapshot,
              unitPriceSnapshot: i.unitPriceSnapshot,
              quantity: i.quantity,
              lineTotal: i.lineTotal,
            })),
          },
        };
      });

      // All discount math is integer cents (see lib/coupons.ts) so what we store, what Stripe
      // charges and what a later refund returns can never disagree by a rounding cent.
      const subtotalsCents = sellerOrdersData.map((so) => toCents(so.subtotal));
      const subtotalCents = subtotalsCents.reduce((a, b) => a + b, 0);

      let discountCents = 0;
      let couponCodeSnapshot: string | null = null;
      if (input.couponId) {
        const coupon = await getCouponById(input.couponId, tx);
        if (!coupon) throw new CouponRejectedError("inactive");

        // Reserve BEFORE reading per-user usage: this UPDATE is the atomic total-limit guard and
        // also row-locks the coupon, serializing concurrent redeemers so the per-user count below
        // can't be raced.
        const reserved = await reserveCouponRedemption(tx, coupon.id);
        const usage = await getCouponUsageForUser(coupon.id, input.buyerId, tx);
        const evaluation = evaluateCoupon(couponToRules(coupon), {
          subtotalCents,
          now: new Date(),
          ...usage,
        });
        if (!reserved) {
          // Lost the race (or expired/deactivated since it was loaded) — say why, if we can.
          const fresh = (await getCouponById(coupon.id, tx)) ?? coupon;
          const freshEvaluation = evaluateCoupon(couponToRules(fresh), { subtotalCents, now: new Date(), ...usage });
          throw new CouponRejectedError(freshEvaluation.ok ? "limit_reached" : freshEvaluation.reason);
        }
        if (!evaluation.ok) throw new CouponRejectedError(evaluation.reason);

        discountCents = evaluation.discountCents;
        couponCodeSnapshot = coupon.code;
      }

      const allocations = allocateDiscountCents(discountCents, subtotalsCents);
      const sellerOrdersCreate = sellerOrdersData.map((so, i) => ({
        ...so,
        discountAllocated: fromCents(allocations[i]),
      }));

      const totalAmount = fromCents(subtotalCents - discountCents);
      const orderNumber = await generateUniqueOrderNumber(tx);

      const created = await tx.order.create({
        data: {
          orderNumber,
          buyerId: input.buyerId,
          totalAmount,
          discountAmount: fromCents(discountCents),
          shippingAddressSnapshot: input.shippingAddressSnapshot,
          ...(input.couponId && couponCodeSnapshot
            ? {
                couponId: input.couponId,
                couponCodeSnapshot,
                couponRedemption: {
                  create: { couponId: input.couponId, userId: input.buyerId, discountAmount: fromCents(discountCents) },
                },
              }
            : {}),
          sellerOrders: { create: sellerOrdersCreate },
          payment: { create: { amount: totalAmount, status: "pending" } },
        },
      });

      return { orderId: created.id, newlyLowStock };
    });

    // Deliberately outside the transaction — never hold a DB transaction open across a network
    // call (same rule createStripeSessionForOrder's caller follows). A failure here must not
    // undo or fail the checkout that already committed; the alert is best-effort.
    for (const item of orderResult.newlyLowStock) {
      await inngest
        .send({ name: "product/stock-low", data: item })
        .catch((err) => logger.error({ err, ...item }, "Failed to enqueue low-stock alert"));
    }

    const order = await getOrderByIdForBuyer(input.buyerId, orderResult.orderId);
    return { ok: true, order: order! };
  } catch (err) {
    if (err instanceof CouponRejectedError) {
      return { ok: false, reason: "coupon_invalid", couponReason: err.couponReason };
    }
    if (err instanceof CheckoutError) {
      return { ok: false, reason: err.reason, productName: err.productName, available: err.available } as CreateOrderFromCartResult;
    }
    throw err;
  }
}

export function updateOrderPaymentSession(orderId: string, stripeSessionId: string) {
  return prisma.payment.update({
    where: { orderId },
    data: { stripePaymentIntentId: stripeSessionId },
  });
}

export function markPaymentFailed(orderId: string) {
  return prisma.$transaction([
    prisma.payment.updateMany({ where: { orderId, status: "pending" }, data: { status: "failed" } }),
    prisma.order.updateMany({
      where: { id: orderId, status: "pending_payment" },
      data: { status: "payment_failed" },
    }),
  ]);
}

/** Buyer + per-seller recipients for the post-payment notification fan-out (order confirmed /
 * payment failed for the buyer, new order received for each seller) — see order-service.ts. */
export function getOrderForNotification(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      buyer: { select: { id: true, email: true } },
      sellerOrders: {
        select: {
          id: true,
          seller: { select: { storeName: true, user: { select: { id: true, email: true } } } },
        },
      },
    },
  });
}

export function getOrdersForBuyer(buyerId: string, opts?: { page?: number }) {
  const page = opts?.page ?? 1;
  return prisma.order.findMany({
    where: { buyerId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE + 1,
    include: ORDER_INCLUDE,
  });
}

export function getOrderByIdForBuyer(buyerId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: ORDER_INCLUDE,
  });
}

/** Counts/sums only "paid" orders — pending/failed ones aren't real purchases yet. */
export async function getBuyerOrderStats(buyerId: string) {
  const result = await prisma.order.aggregate({
    where: { buyerId, status: "paid" },
    _count: true,
    _sum: { totalAmount: true },
  });
  return { orderCount: result._count, totalSpent: result._sum.totalAmount ?? 0 };
}

/** Lean projection for an account-page preview — the full ORDER_INCLUDE is overkill here. */
export function getRecentOrdersForBuyer(buyerId: string, limit: number) {
  return prisma.order.findMany({
    where: { buyerId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, orderNumber: true, status: true, totalAmount: true, createdAt: true },
  });
}
