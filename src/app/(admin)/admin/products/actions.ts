"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { approveProduct, rejectProduct } from "@/server/services/product-service";

async function requireAdmin() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/products");
  if (session.user.role !== "admin") redirect("/");
  return session.user.id;
}

export async function approveProductAction(productId: string) {
  const actorUserId = await requireAdmin();
  const result = await approveProduct(productId, actorUserId);
  revalidatePath("/admin/products");
  return result;
}

export async function rejectProductAction(productId: string) {
  const actorUserId = await requireAdmin();
  const result = await rejectProduct(productId, actorUserId);
  revalidatePath("/admin/products");
  return result;
}
