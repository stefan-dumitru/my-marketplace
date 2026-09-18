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
}

export async function approveSellerAction(sellerProfileId: string) {
  // Independently re-verified — this Action is its own entry point, not protected by the
  // (admin) layout's redirect just because the page that rendered its button was.
  await requireAdmin();
  const result = await approveSellerApplication(sellerProfileId);
  revalidatePath("/admin/sellers");
  return result;
}

export async function rejectSellerAction(sellerProfileId: string) {
  await requireAdmin();
  const result = await rejectSellerApplication(sellerProfileId);
  revalidatePath("/admin/sellers");
  return result;
}

export async function suspendSellerAction(sellerProfileId: string) {
  await requireAdmin();
  const result = await suspendSeller(sellerProfileId);
  revalidatePath("/admin/sellers");
  return result;
}

export async function reinstateSellerAction(sellerProfileId: string) {
  await requireAdmin();
  const result = await reinstateSeller(sellerProfileId);
  revalidatePath("/admin/sellers");
  return result;
}

export async function updateCommissionAction(sellerProfileId: string, rateInput: string) {
  await requireAdmin();
  const result = await updateSellerCommission(sellerProfileId, rateInput);
  revalidatePath("/admin/sellers");
  return result;
}
