"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { submitReview, type SubmitReviewResult } from "@/server/services/review-service";
import type { CreateReviewInput } from "@/lib/validations/review";

export async function submitReviewAction(
  orderId: string,
  orderItemId: string,
  input: CreateReviewInput
): Promise<SubmitReviewResult> {
  // Independently re-verified here — this Action is its own entry point, not protected by the
  // order detail page's own auth check.
  const session = await auth();
  if (!session) redirect(`/auth/login?callbackUrl=/orders/${orderId}`);

  const result = await submitReview(session.user.id, orderItemId, input);
  revalidatePath(`/orders/${orderId}`);
  return result;
}
