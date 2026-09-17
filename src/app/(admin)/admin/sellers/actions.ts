"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { approveSellerApplication, rejectSellerApplication } from "@/server/services/seller-service";

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
