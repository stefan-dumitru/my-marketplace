import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma, Coupon } from "@/generated/prisma/client";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import type { CouponRules } from "@/lib/coupons";

/** Either the shared client or an open checkout transaction — the same reads run in both. */
type Db = Prisma.TransactionClient | typeof prisma;

export function getCouponByCode(code: string, db: Db = prisma) {
  return db.coupon.findUnique({ where: { code } });
}

export function getCouponById(id: string, db: Db = prisma) {
  return db.coupon.findUnique({ where: { id } });
}

/** Decimal columns → plain numbers, so the pure rules in lib/coupons.ts never see Prisma types. */
export function couponToRules(coupon: Coupon): CouponRules {
  return {
    type: coupon.type,
    value: Number(coupon.value),
    minOrderAmount: coupon.minOrderAmount === null ? null : Number(coupon.minOrderAmount),
    maxDiscountAmount: coupon.maxDiscountAmount === null ? null : Number(coupon.maxDiscountAmount),
    startsAt: coupon.startsAt,
    expiresAt: coupon.expiresAt,
    maxRedemptionsTotal: coupon.maxRedemptionsTotal,
    maxRedemptionsPerUser: coupon.maxRedemptionsPerUser,
    firstOrderOnly: coupon.firstOrderOnly,
    isActive: coupon.isActive,
    redemptionCount: coupon.redemptionCount,
  };
}

export async function getCouponUsageForUser(couponId: string, userId: string, db: Db = prisma) {
  // Sequential on purpose: inside a checkout transaction both queries share one connection, and
  // pg deprecates issuing a second query while one is still in flight on the same client.
  const userRedemptionCount = await db.couponRedemption.count({ where: { couponId, userId } });
  // "First order" means no earlier *paid* order — cancelled/abandoned checkouts don't count.
  const paidOrders = await db.order.count({ where: { buyerId: userId, status: "paid" } });
  return { userRedemptionCount, hasPriorPaidOrder: paidOrders > 0 };
}

/** An unpaid order of this buyer that still holds a redemption of the coupon — lets the "already
 * used" error explain *why* (they abandoned a checkout) instead of looking like a bug. */
export function findUnpaidOrderHoldingCoupon(userId: string, couponId: string) {
  return prisma.couponRedemption.findFirst({
    where: { couponId, userId, order: { status: { in: ["pending_payment", "payment_failed"] } } },
    select: { orderId: true },
  });
}

/**
 * The actual guard against over-redeeming under concurrency: one conditional UPDATE that only
 * succeeds while the coupon is still active, in its date window, and under its total limit — the
 * same atomic-conditional-write idea as the stock decrement in createOrderFromCart, but written as
 * raw SQL because Prisma's where-clause can't compare one column to another
 * (redemptionCount < maxRedemptionsTotal). Tagged-template parameterized, never interpolated.
 *
 * Side effect that matters: the UPDATE takes a row lock on the coupon until the surrounding
 * transaction ends, so two checkouts racing on the same coupon are serialized — the second one
 * then sees the first one's redemption row when it counts per-user usage.
 */
export async function reserveCouponRedemption(tx: Prisma.TransactionClient, couponId: string) {
  // Prisma stores DateTime as UTC in `timestamp without time zone`, so "now" must be UTC too —
  // plain now() is converted to the session's timezone and skews every comparison by its offset.
  const updated = await tx.$executeRaw`
    UPDATE coupons
    SET "redemptionCount" = "redemptionCount" + 1, "updatedAt" = (now() AT TIME ZONE 'UTC')
    WHERE id = ${couponId}
      AND "isActive" = true
      AND ("maxRedemptionsTotal" IS NULL OR "redemptionCount" < "maxRedemptionsTotal")
      AND ("startsAt" IS NULL OR "startsAt" <= (now() AT TIME ZONE 'UTC'))
      AND ("expiresAt" IS NULL OR "expiresAt" > (now() AT TIME ZONE 'UTC'))
  `;
  return updated === 1;
}

export function setCartCoupon(cartId: string, couponId: string | null) {
  return prisma.cart.update({ where: { id: cartId }, data: { couponId } });
}

// --- Admin ---

export type CouponWriteData = {
  code: string;
  type: "percentage" | "fixed_amount";
  value: number;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  maxRedemptionsTotal: number | null;
  maxRedemptionsPerUser: number | null;
  firstOrderOnly: boolean;
  isActive: boolean;
};

export function createCouponRecord(data: CouponWriteData, createdByUserId: string) {
  return prisma.coupon.create({ data: { ...data, createdByUserId } });
}

export function updateCouponRecord(id: string, data: Partial<CouponWriteData>) {
  return prisma.coupon.update({ where: { id }, data });
}

export async function listCouponsForAdmin(opts?: { page?: number }) {
  const page = opts?.page ?? 1;
  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE + 1,
  });
  const totals = await prisma.couponRedemption.groupBy({
    by: ["couponId"],
    where: { couponId: { in: coupons.map((c) => c.id) }, order: { status: "paid" } },
    _sum: { discountAmount: true },
    _count: true,
  });
  const byCoupon = new Map(totals.map((t) => [t.couponId, t]));
  return coupons.map((coupon) => ({
    coupon,
    paidRedemptions: byCoupon.get(coupon.id)?._count ?? 0,
    totalDiscountGiven: Number(byCoupon.get(coupon.id)?._sum.discountAmount ?? 0),
  }));
}
