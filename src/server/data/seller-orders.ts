import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

const SELLER_ORDER_INCLUDE = {
  items: true,
  returnRequest: true,
  order: {
    select: {
      orderNumber: true,
      shippingAddressSnapshot: true,
      createdAt: true,
      payment: { select: { stripePaymentIntentId: true } },
      buyer: { select: { id: true, email: true } },
    },
  },
} as const;

export function listSellerOrdersForSeller(
  sellerId: string,
  opts?: { page?: number; pageSize?: number }
) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  return prisma.sellerOrder.findMany({
    where: { sellerId },
    orderBy: { order: { createdAt: "desc" } }, // no createdAt on SellerOrder itself; use the parent order's
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
    include: {
      items: true,
      returnRequest: { select: { status: true } },
      order: { select: { orderNumber: true, createdAt: true } },
    },
  });
}

export function getSellerOrderByIdForSeller(sellerId: string, sellerOrderId: string) {
  return prisma.sellerOrder.findFirst({
    where: { id: sellerOrderId, sellerId },
    include: SELLER_ORDER_INCLUDE,
  });
}

/**
 * Verify-then-update, mirroring products.ts's exact pattern: ownership AND state eligibility
 * (currently "confirmed", with a tracking number created together with its FAN Courier label) are
 * all checked in the scoped read before writing. The tracking number is never supplied by the
 * caller — it can only be the one stored when the label was generated.
 */
export async function markSellerOrderShippedForSeller(sellerId: string, sellerOrderId: string) {
  const eligible = await prisma.sellerOrder.findFirst({
    where: {
      id: sellerOrderId,
      sellerId,
      status: "confirmed",
      trackingNumber: { not: null },
      labelUrl: { not: null },
    },
    select: { id: true },
  });
  if (!eligible) return null;

  return prisma.sellerOrder.update({
    where: { id: sellerOrderId },
    data: { status: "shipped", shippedAt: new Date() },
    include: SELLER_ORDER_INCLUDE,
  });
}

/**
 * Verify-then-update, mirroring markSellerOrderShippedForSeller: only a currently-"shipped"
 * order owned by this seller can be marked delivered.
 */
export async function markSellerOrderDeliveredForSeller(sellerId: string, sellerOrderId: string) {
  const owned = await prisma.sellerOrder.findFirst({
    where: { id: sellerOrderId, sellerId, status: "shipped" },
    select: { id: true },
  });
  if (!owned) return null;

  return prisma.sellerOrder.update({
    where: { id: sellerOrderId },
    data: { status: "delivered", deliveredAt: new Date() },
    include: SELLER_ORDER_INCLUDE,
  });
}

/**
 * The DB-only half of cancellation — no Stripe call in here, per this codebase's rule of never
 * holding a transaction open across a network call (see orders.ts's createOrderFromCart for the
 * precedent). Releases stock for every item atomically alongside the status change. Returns null
 * if not owned or not currently cancellable (already shipped/cancelled/etc).
 */
export async function cancelSellerOrderTransaction(sellerId: string, sellerOrderId: string) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.sellerOrder.findFirst({
      where: { id: sellerOrderId, sellerId, status: "confirmed" },
      include: { items: true },
    });
    if (!owned) return null;

    await tx.sellerOrder.update({
      where: { id: sellerOrderId },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    // Releasing stock is a plain increment, not the conditional decrement checkout uses — there's
    // no lower bound to protect going back up, so no race to guard against here.
    for (const item of owned.items) {
      await tx.productVariant.update({
        where: { id: item.productVariantId },
        data: { stockQty: { increment: item.quantity } },
      });
    }

    return tx.sellerOrder.findFirst({
      where: { id: sellerOrderId },
      include: SELLER_ORDER_INCLUDE,
    });
  });
}

/**
 * Verify-then-act inside one transaction, mirroring cancelSellerOrderTransaction: ownership,
 * current status ("delivered"), and a still-pending return request are all checked in the same
 * where-clause before writing. On approval, also flips the sub-order to "returned" and releases
 * stock for every item, exactly like cancellation does for the pre-shipment case. Returns null if
 * not owned or not currently resolvable (already resolved, wrong status, no request at all).
 */
export async function resolveReturnRequestTransaction(
  sellerId: string,
  sellerOrderId: string,
  decision: "approved" | "rejected"
) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.sellerOrder.findFirst({
      where: { id: sellerOrderId, sellerId, status: "delivered", returnRequest: { status: "pending" } },
      include: { items: true, returnRequest: true },
    });
    if (!owned || !owned.returnRequest) return null;

    await tx.returnRequest.update({
      where: { id: owned.returnRequest.id },
      data: { status: decision, resolvedAt: new Date() },
    });

    if (decision === "approved") {
      await tx.sellerOrder.update({
        where: { id: sellerOrderId },
        data: { status: "returned" },
      });

      // Same plain increment as cancellation's stock release — no lower bound to protect here.
      for (const item of owned.items) {
        await tx.productVariant.update({
          where: { id: item.productVariantId },
          data: { stockQty: { increment: item.quantity } },
        });
      }
    }

    return tx.sellerOrder.findFirst({
      where: { id: sellerOrderId },
      include: SELLER_ORDER_INCLUDE,
    });
  });
}

export function markSellerOrderRefunded(sellerOrderId: string) {
  return prisma.sellerOrder.update({
    where: { id: sellerOrderId },
    data: { refundedAt: new Date() },
  });
}

// payoutAmount > 0 excludes orders that predate this increment's fix to actually compute it at
// checkout (they're permanently stuck at 0) — Stripe rejects a zero-amount Transfer outright
// ("must be greater than or equal to 1"), so there's nothing releasable for those historical rows.
//
// Batched per seller by payout-service.ts's releaseSellerPayouts, not released one order at a
// time — see that function for why (one Stripe transfer per seller per run, not per order).
export function listPayoutEligibleSellerIds(cutoff: Date) {
  return prisma.sellerOrder
    .findMany({
      where: {
        status: "delivered",
        payoutAt: null,
        payoutAmount: { gt: 0 },
        deliveredAt: { lte: cutoff },
        seller: { payoutsEnabled: true },
      },
      distinct: ["sellerId"],
      select: { sellerId: true },
    })
    .then((rows) => rows.map((r) => r.sellerId));
}

export function getPayoutEligibleOrdersForSeller(sellerId: string, cutoff: Date) {
  return prisma.sellerOrder.findMany({
    where: {
      sellerId,
      status: "delivered",
      payoutAt: null,
      payoutAmount: { gt: 0 },
      deliveredAt: { lte: cutoff },
      seller: { payoutsEnabled: true },
    },
    orderBy: { deliveredAt: "asc" },
    select: { id: true, payoutAmount: true, deliveredAt: true },
  });
}

/**
 * Bulk verify-then-update: only currently-"delivered", not-yet-paid-out orders among the given
 * ids are touched, so a retried step after a transient failure can't double-mark anything — see
 * payout-service.ts's releaseSellerPayouts for the full idempotent-retry orchestration.
 */
export async function markSellerOrdersPaidOut(sellerOrderIds: string[], paidAt: Date) {
  return prisma.sellerOrder.updateMany({
    where: { id: { in: sellerOrderIds }, status: "delivered", payoutAt: null },
    data: { payoutAt: paidAt },
  });
}

