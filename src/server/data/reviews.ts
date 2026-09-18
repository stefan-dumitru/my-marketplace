import "server-only";
import { prisma } from "@/lib/prisma";
import type { ReviewStatus } from "@/generated/prisma/enums";

/**
 * Ownership AND state eligibility both checked here, mirroring seller-orders.ts's
 * verify-then-update pattern: only an OrderItem belonging to this buyer, inside a sub-order
 * that's actually "delivered", is reviewable. productId comes straight off ProductVariant — no
 * extra join through Product needed.
 */
export function findReviewableOrderItemForBuyer(buyerId: string, orderItemId: string) {
  return prisma.orderItem.findFirst({
    where: {
      id: orderItemId,
      sellerOrder: { status: "delivered", order: { buyerId } },
    },
    select: {
      id: true,
      productVariant: { select: { productId: true } },
    },
  });
}

export function createReview(data: {
  productId: string;
  buyerId: string;
  orderItemId: string;
  rating: number;
  title: string;
  body: string;
}) {
  return prisma.review.create({ data });
}

export function listApprovedReviewsForProduct(productId: string) {
  return prisma.review.findMany({
    where: { productId, status: "approved" },
    orderBy: { createdAt: "desc" },
    include: { buyer: { select: { name: true } } },
  });
}

export async function getReviewSummaryForProduct(productId: string) {
  const result = await prisma.review.aggregate({
    where: { productId, status: "approved" },
    _avg: { rating: true },
    _count: true,
  });
  return { average: result._avg.rating, count: result._count };
}

export function listPendingReviews() {
  return prisma.review.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: {
      product: { select: { name: true, slug: true } },
      buyer: { select: { name: true, email: true } },
    },
  });
}

/** Verify-then-update: only a still-pending review can be moderated. */
export async function setReviewStatus(reviewId: string, status: Extract<ReviewStatus, "approved" | "rejected">) {
  const result = await prisma.review.updateMany({
    where: { id: reviewId, status: "pending" },
    data: { status },
  });
  return result.count === 1;
}
