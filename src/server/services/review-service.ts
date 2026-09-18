import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { createReviewSchema, type CreateReviewInput } from "@/lib/validations/review";
import {
  createReview,
  findReviewableOrderItemForBuyer,
  getReviewSummaryForProduct,
  listApprovedReviewsForProduct,
  listPendingReviews,
  setReviewStatus,
} from "@/server/data/reviews";

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

export function listPendingReviewsForAdmin() {
  return listPendingReviews();
}

export async function moderateReview(
  reviewId: string,
  decision: "approved" | "rejected"
): Promise<ModerateReviewResult> {
  const applied = await setReviewStatus(reviewId, decision);
  if (!applied) {
    return { ok: false, formError: "This review was already decided." };
  }
  return { ok: true };
}
