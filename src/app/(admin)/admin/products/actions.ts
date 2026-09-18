"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { approveProduct, rejectProduct } from "@/server/services/product-service";

async function requireAdmin() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/products");
  if (session.user.role !== "admin") redirect("/");
}

export async function approveProductAction(productId: string) {
  await requireAdmin();
  const result = await approveProduct(productId);
  revalidatePath("/admin/products");
  return result;
}

export async function rejectProductAction(productId: string) {
  await requireAdmin();
  const result = await rejectProduct(productId);
  revalidatePath("/admin/products");
  return result;
}
