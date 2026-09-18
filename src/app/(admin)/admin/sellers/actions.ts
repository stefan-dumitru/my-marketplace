"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  approveSellerApplication,
  reinstateSeller,
  rejectSellerApplication,
  suspendSeller,
  updateSellerCommission,
} from "@/server/services/seller-service";

async function requireAdmin() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/sellers");
  if (session.user.role !== "admin") redirect("/");
  return session.user.id;
}

export async function approveSellerAction(sellerProfileId: string) {
  // Independently re-verified — this Action is its own entry point, not protected by the
  // (admin) layout's redirect just because the page that rendered its button was.
  const actorUserId = await requireAdmin();
  const result = await approveSellerApplication(sellerProfileId, actorUserId);
  revalidatePath("/admin/sellers");
  return result;
}

export async function rejectSellerAction(sellerProfileId: string) {
  const actorUserId = await requireAdmin();
  const result = await rejectSellerApplication(sellerProfileId, actorUserId);
  revalidatePath("/admin/sellers");
  return result;
}

export async function suspendSellerAction(sellerProfileId: string) {
  const actorUserId = await requireAdmin();
  const result = await suspendSeller(sellerProfileId, actorUserId);
  revalidatePath("/admin/sellers");
  return result;
}

export async function reinstateSellerAction(sellerProfileId: string) {
  const actorUserId = await requireAdmin();
  const result = await reinstateSeller(sellerProfileId, actorUserId);
  revalidatePath("/admin/sellers");
  return result;
}

export async function updateCommissionAction(sellerProfileId: string, rateInput: string) {
  const actorUserId = await requireAdmin();
  const result = await updateSellerCommission(sellerProfileId, rateInput, actorUserId);
  revalidatePath("/admin/sellers");
  return result;
}
