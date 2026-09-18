import "server-only";
import { prisma } from "@/lib/prisma";

const SELLER_ORDER_INCLUDE = {
  items: true,
  order: {
    select: {
      orderNumber: true,
      shippingAddressSnapshot: true,
      createdAt: true,
      payment: { select: { stripePaymentIntentId: true } },
      buyer: { select: { email: true } },
    },
  },
} as const;

export function listSellerOrdersForSeller(sellerId: string, opts?: { take?: number }) {
  return prisma.sellerOrder.findMany({
    where: { sellerId },
    orderBy: { order: { createdAt: "desc" } }, // no createdAt on SellerOrder itself; use the parent order's
    take: opts?.take ?? 50,
    include: {
      items: true,
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
 * (must currently be "confirmed") are both checked in the scoped read before writing.
 */
export async function markSellerOrderShippedForSeller(
  sellerId: string,
  sellerOrderId: string,
  trackingNumber: string
) {
  const owned = await prisma.sellerOrder.findFirst({
    where: { id: sellerOrderId, sellerId, status: "confirmed" },
    select: { id: true },
  });
  if (!owned) return null;

  return prisma.sellerOrder.update({
    where: { id: sellerOrderId },
    data: { status: "shipped", shippedAt: new Date(), trackingNumber },
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

export function markSellerOrderRefunded(sellerOrderId: string) {
  return prisma.sellerOrder.update({
    where: { id: sellerOrderId },
    data: { refundedAt: new Date() },
  });
}

const PAYOUT_READY_INCLUDE = {
  seller: { select: { storeName: true, stripeConnectAccountId: true } },
  order: { select: { orderNumber: true } },
} as const;

// payoutAmount > 0 excludes orders that predate this increment's fix to actually compute it at
// checkout (they're permanently stuck at 0) — Stripe rejects a zero-amount Transfer outright
// ("must be greater than or equal to 1"), so there's nothing releasable for those historical rows.
export function listPayoutReadySellerOrdersForAdmin() {
  return prisma.sellerOrder.findMany({
    where: { status: "delivered", payoutAt: null, payoutAmount: { gt: 0 }, seller: { payoutsEnabled: true } },
    orderBy: { deliveredAt: "asc" },
    include: PAYOUT_READY_INCLUDE,
  });
}

export function getPayoutReadySellerOrderById(sellerOrderId: string) {
  return prisma.sellerOrder.findFirst({
    where: {
      id: sellerOrderId,
      status: "delivered",
      payoutAt: null,
      payoutAmount: { gt: 0 },
      seller: { payoutsEnabled: true },
    },
    include: PAYOUT_READY_INCLUDE,
  });
}

/**
 * Verify-then-update: only a currently-"delivered", not-yet-paid-out order can be released, so
 * a double-click (or a retried action after a transient failure) can't trigger a second Transfer
 * — see payout-service.ts's releasePayout for the full idempotent-retry orchestration.
 */
export async function markSellerOrderPaidOut(sellerOrderId: string, stripeTransferId: string) {
  const owned = await prisma.sellerOrder.findFirst({
    where: { id: sellerOrderId, status: "delivered", payoutAt: null },
    select: { id: true },
  });
  if (!owned) return null;

  return prisma.sellerOrder.update({
    where: { id: sellerOrderId },
    data: { payoutAt: new Date(), stripeTransferId },
  });
}
