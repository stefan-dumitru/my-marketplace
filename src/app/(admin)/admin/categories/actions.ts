"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createCategoryForAdmin, updateCategoryForAdmin } from "@/server/services/category-service";
import type { CategoryInput } from "@/lib/validations/category";

async function requireAdmin() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/categories");
  if (session.user.role !== "admin") redirect("/");
}

export async function createCategoryAction(input: CategoryInput) {
  await requireAdmin();
  const result = await createCategoryForAdmin(input);
  revalidatePath("/admin/categories");
  return result;
}

export async function updateCategoryAction(id: string, input: CategoryInput) {
  await requireAdmin();
  const result = await updateCategoryForAdmin(id, input);
  revalidatePath("/admin/categories");
  return result;
}
