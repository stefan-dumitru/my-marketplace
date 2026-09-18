"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { moderateReview } from "@/server/services/review-service";

async function requireAdmin() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/reviews");
  if (session.user.role !== "admin") redirect("/");
}

export async function approveReviewAction(reviewId: string) {
  // Independently re-verified — this Action is its own entry point, not protected by the
  // (admin) layout's redirect just because the page that rendered its button was.
  await requireAdmin();
  const result = await moderateReview(reviewId, "approved");
  revalidatePath("/admin/reviews");
  return result;
}

export async function rejectReviewAction(reviewId: string) {
  await requireAdmin();
  const result = await moderateReview(reviewId, "rejected");
  revalidatePath("/admin/reviews");
  return result;
}
