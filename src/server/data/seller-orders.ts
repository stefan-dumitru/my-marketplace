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
