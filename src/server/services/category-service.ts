import "server-only";
import { categorySchema, type CategoryInput } from "@/lib/validations/category";
import {
  createCategory,
  getCategoryBySlug,
  getCategoryById,
  listAllCategoriesForAdmin,
  updateCategory,
} from "@/server/data/categories";
import { slugify } from "@/lib/slug";
import { createAuditLog } from "@/server/data/audit-log";

export type CreateCategoryResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof CategoryInput, string>>; formError?: string };

export type UpdateCategoryResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof CategoryInput, string>>; formError?: string };

async function uniqueCategorySlug(name: string): Promise<string> {
  const base = slugify(name) || "category";
  let candidate = base;
  let suffix = 2;
  // Same small accepted TOCTOU window as seller-service.ts's uniqueStoreSlug.
  while (await getCategoryBySlug(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function getCategoriesForAdmin() {
  return listAllCategoriesForAdmin();
}

export function getCategoryForAdmin(id: string) {
  return getCategoryById(id);
}

export async function createCategoryForAdmin(input: CategoryInput): Promise<CreateCategoryResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }
  const { name, parentId, imageUrl, isActive, defaultCommissionRate } = parsed.data;

  const slug = await uniqueCategorySlug(name);

  await createCategory({
    name,
    slug,
    parentId: parentId || null,
    imageUrl: imageUrl || null,
    isActive,
    defaultCommissionRate,
  });

  return { ok: true };
}

export async function updateCategoryForAdmin(
  id: string,
  input: CategoryInput,
  actorUserId: string
): Promise<UpdateCategoryResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }
  const { name, parentId, imageUrl, isActive, defaultCommissionRate } = parsed.data;

  // A category can never be its own parent — checked here since the data-access layer's
  // verify-then-update only confirms existence, not this business rule.
  if (parentId === id) {
    return { ok: false, fieldErrors: { parentId: "A category can't be its own parent." } };
  }

  const before = await getCategoryById(id);

  const updated = await updateCategory(id, {
    name,
    parentId: parentId || null,
    imageUrl: imageUrl || null,
    isActive,
    defaultCommissionRate,
  });

  if (!updated) {
    return { ok: false, formError: "Category not found." };
  }

  // Scoped to commission-rate changes only, not every field edit — security.md's audit
  // requirement is specifically about "commission-rate changes," not general category CRUD.
  const oldRate = before?.defaultCommissionRate.toString();
  const newRate = updated.defaultCommissionRate.toString();
  if (oldRate !== newRate) {
    await createAuditLog({
      actorUserId,
      action: "category_commission_updated",
      entityType: "Category",
      entityId: id,
      beforeValue: { defaultCommissionRate: oldRate },
      afterValue: { defaultCommissionRate: newRate },
    });
  }

  return { ok: true };
}
