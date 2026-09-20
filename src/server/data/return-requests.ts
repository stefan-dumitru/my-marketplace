import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Ownership AND state eligibility both checked here, mirroring reviews.ts's
 * findReviewableOrderItemForBuyer: only a "delivered" sub-order belonging to this buyer, with no
 * existing return request yet, is eligible. Selects just enough to create the request and notify
 * the seller.
 */
export function findReturnableSellerOrderForBuyer(buyerId: string, sellerOrderId: string) {
  return prisma.sellerOrder.findFirst({
    where: {
      id: sellerOrderId,
      status: "delivered",
      order: { buyerId },
      returnRequest: null,
    },
    select: {
      id: true,
      subtotal: true,
      order: { select: { orderNumber: true } },
      seller: { select: { storeName: true, user: { select: { id: true, email: true } } } },
    },
  });
}

export function createReturnRequest(sellerOrderId: string, reason: string) {
  return prisma.returnRequest.create({ data: { sellerOrderId, reason } });
}
