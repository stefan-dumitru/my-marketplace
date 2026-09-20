"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createCategoryForAdmin, updateCategoryForAdmin } from "@/server/services/category-service";
import { categorySchema } from "@/lib/validations/category";
import { uploadImage } from "@/server/services/upload-service";

async function requireAdmin() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/categories");
  if (session.user.role !== "admin") redirect("/");
  return session.user.id;
}

function parseCategoryFields(formData: FormData) {
  return categorySchema.safeParse({
    name: formData.get("name"),
    parentId: formData.get("parentId"),
    isActive: formData.get("isActive") === "true",
    defaultCommissionRate: formData.get("defaultCommissionRate"),
  });
}

async function resolveImageUrl(formData: FormData): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const imageFile = formData.get("image");
  if (imageFile instanceof File && imageFile.size > 0) {
    const result = await uploadImage(imageFile, "categories");
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, url: result.url };
  }
  const existing = formData.get("existingImage");
  return { ok: true, url: typeof existing === "string" && existing ? existing : null };
}

export async function createCategoryAction(formData: FormData) {
  await requireAdmin();

  const parsed = parseCategoryFields(formData);
  if (!parsed.success) {
    return { ok: false as const, formError: "Please fix the errors above and try again." };
  }

  const imageResult = await resolveImageUrl(formData);
  if (!imageResult.ok) {
    return { ok: false as const, formError: imageResult.error };
  }

  const result = await createCategoryForAdmin(parsed.data, imageResult.url);
  revalidatePath("/admin/categories");
  return result;
}

export async function updateCategoryAction(id: string, formData: FormData) {
  const actorUserId = await requireAdmin();

  const parsed = parseCategoryFields(formData);
  if (!parsed.success) {
    return { ok: false as const, formError: "Please fix the errors above and try again." };
  }

  const imageResult = await resolveImageUrl(formData);
  if (!imageResult.ok) {
    return { ok: false as const, formError: imageResult.error };
  }

  const result = await updateCategoryForAdmin(id, parsed.data, actorUserId, imageResult.url);
  revalidatePath("/admin/categories");
  return result;
}
