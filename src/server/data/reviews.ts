import "server-only";
import { prisma } from "@/lib/prisma";
import { enqueueSearchSync } from "@/lib/search-sync";
import type { ReviewStatus } from "@/generated/prisma/enums";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

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

/**
 * Order items delivered within [dayStart, dayEnd) that still have no review — the candidate set
 * for the "leave a review" reminder job (see sendReviewReminders). Scoped to a single calendar
 * day, not "delivered more than N days ago," so a daily cron run only ever reminds each item
 * once, on the one day it crosses the threshold — mirroring sales-rollup-service.ts's own
 * day-bucket pattern for the same reason (idempotent per run, no dedup table needed).
 */
export function findOrderItemsNeedingReviewReminder(dayStart: Date, dayEnd: Date) {
  return prisma.orderItem.findMany({
    where: {
      review: null,
      sellerOrder: { status: "delivered", deliveredAt: { gte: dayStart, lt: dayEnd } },
    },
    select: {
      id: true,
      productNameSnapshot: true,
      sellerOrder: {
        select: { order: { select: { id: true, buyer: { select: { id: true, email: true } } } } },
      },
    },
  });
}

export async function createReview(data: {
  productId: string;
  buyerId: string;
  orderItemId: string;
  rating: number;
  title: string;
  body: string;
}) {
  // Explicit rather than relying on the schema default alone — this line is the actual
  // "no admin approval gate" decision, so it shouldn't be implicit.
  const created = await prisma.review.create({ data: { ...data, status: "approved" } });
  // A new approved review changes the product's average rating, which the search index filters on.
  await enqueueSearchSync({ productIds: [data.productId] });
  return created;
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

/**
 * Post-publish moderation queue: every review auto-approves on submission (see createReview), so
 * there's no pre-publish "pending" backlog anymore — this lists live (approved) and already
 * taken-down (rejected) reviews together, newest first, so an admin can spot and act on new
 * content instead of triaging a queue.
 */
export function listReviewsForAdmin(opts?: { page?: number }) {
  const page = opts?.page ?? 1;
  return prisma.review.findMany({
    where: { status: { in: ["approved", "rejected"] } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE + 1,
    include: {
      product: { select: { name: true, slug: true } },
      buyer: { select: { name: true, email: true } },
    },
  });
}

/**
 * Verify-then-update: toggles a review between visible (approved) and taken-down (rejected).
 * Guards against a no-op (setting the status it's already in) and a concurrent double-submit
 * racing the same change, the same way suspendSeller/reinstateSeller guard their own toggle.
 */
export async function setReviewStatus(reviewId: string, status: Extract<ReviewStatus, "approved" | "rejected">) {
  const result = await prisma.review.updateMany({
    where: { id: reviewId, status: { not: status } },
    data: { status },
  });
  if (result.count !== 1) return false;
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { productId: true } });
  if (review) await enqueueSearchSync({ productIds: [review.productId] });
  return true;
}
