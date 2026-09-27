import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { createReviewSchema, type CreateReviewInput } from "@/lib/validations/review";
import {
  createReview,
  findOrderItemsNeedingReviewReminder,
  findReviewableOrderItemForBuyer,
  getReviewSummaryForProduct,
  listApprovedReviewsForProduct,
  listReviewsForAdmin,
  setReviewStatus,
} from "@/server/data/reviews";
import { createAuditLog } from "@/server/data/audit-log";
import { splitPage } from "@/lib/pagination";
import { queueEmail } from "@/lib/email";
import { notifyUser } from "@/server/services/notification-service";
import { REVIEW_REMINDER_DELAY_DAYS } from "@/lib/constants";

export type SubmitReviewResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof CreateReviewInput, string>>; formError?: string };

export type ModerateReviewResult = { ok: true } | { ok: false; formError: string };

/** orderId is only used by the action layer for revalidatePath, not needed here. */
export async function submitReview(
  buyerId: string,
  orderItemId: string,
  input: CreateReviewInput
): Promise<SubmitReviewResult> {
  const parsed = createReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  const item = await findReviewableOrderItemForBuyer(buyerId, orderItemId);
  if (!item) {
    return { ok: false, formError: "This item isn't eligible for a review yet." };
  }

  try {
    await createReview({
      productId: item.productVariant.productId,
      buyerId,
      orderItemId,
      rating: parsed.data.rating,
      title: parsed.data.title,
      body: parsed.data.body,
    });
  } catch (err) {
    // Race-safe backstop behind the eligibility check above: two concurrent submits for the
    // same item both pass the check, but only one can win the unique constraint on orderItemId.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, formError: "You've already reviewed this item." };
    }
    throw err;
  }

  return { ok: true };
}

export async function getProductReviews(productId: string) {
  const [reviews, summary] = await Promise.all([
    listApprovedReviewsForProduct(productId),
    getReviewSummaryForProduct(productId),
  ]);
  return { reviews, summary };
}

export async function listReviewsForAdminModeration(page?: number) {
  const rows = await listReviewsForAdmin({ page });
  const { items: reviews, hasNextPage } = splitPage(rows);
  return { reviews, hasNextPage };
}

/**
 * Post-publish moderation only — every review is already live (auto-approved on submission, see
 * submitReview) by the time this runs. "approved" restores a previously taken-down review;
 * "rejected" takes down a live one. Either direction is a no-op if the review is already in that
 * state (see setReviewStatus's guard).
 */
export async function moderateReview(
  reviewId: string,
  decision: "approved" | "rejected",
  actorUserId: string
): Promise<ModerateReviewResult> {
  const applied = await setReviewStatus(reviewId, decision);
  if (!applied) {
    return { ok: false, formError: "This review is already in that state." };
  }
  await createAuditLog({
    actorUserId,
    action: decision === "approved" ? "review_approved" : "review_rejected",
    entityType: "Review",
    entityId: reviewId,
    afterValue: { status: decision },
  });
  return { ok: true };
}

/** Midnight UTC for whatever calendar day `d` falls on — mirrors sales-rollup-service.ts's own
 *  dateOnlyUTC, kept local rather than shared since the two day-bucket jobs are otherwise unrelated. */
function dateOnlyUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Called daily by the review-reminder background job (see inngest/functions.ts). Reminds buyers
 * about exactly the order items whose delivery crossed the REVIEW_REMINDER_DELAY_DAYS threshold
 * "today" (relative to `now`) — a single calendar-day bucket, not "delivered more than N days
 * ago," so a daily run only ever reminds each item once, on the one day it qualifies. See
 * findOrderItemsNeedingReviewReminder's doc comment for why this needs no separate dedup table.
 */
export async function sendReviewReminders(now: Date = new Date()): Promise<{ remindersSent: number }> {
  const today = dateOnlyUTC(now);
  const dayStart = new Date(today.getTime() - REVIEW_REMINDER_DELAY_DAYS * 24 * 60 * 60 * 1000);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const items = await findOrderItemsNeedingReviewReminder(dayStart, dayEnd);

  await Promise.all(
    items.map(async (item) => {
      const buyer = item.sellerOrder.order.buyer;
      const title = "How was your purchase?";
      const body = `Now that "${item.productNameSnapshot}" has arrived, we'd love to hear what you think — leave a review from your order page.`;
      await queueEmail({
        to: buyer.email,
        subject: title,
        html: `<p>${body}</p>`,
        text: body,
      }).catch(() => {});
      await notifyUser({
        userId: buyer.id,
        type: "review_reminder",
        title,
        body,
        link: `/orders/${item.sellerOrder.order.id}`,
      }).catch(() => {});
    })
  );

  return { remindersSent: items.length };
}
