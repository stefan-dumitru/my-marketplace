import "server-only";
import {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from "@/lib/validations/product";
import {
  approveProductForAdmin,
  createProductForSeller,
  getProductByIdForSeller,
  getProductBySellerAndSku,
  getProductBySlug,
  listActiveProducts,
  listDistinctActiveBrands,
  listPendingProductsForAdmin,
  listProductsForSeller as listProductsForSellerData,
  rejectProductForAdmin,
  setProductStatusForSeller,
  updateProductForSeller,
} from "@/server/data/products";
import { createAuditLog } from "@/server/data/audit-log";
import { slugify } from "@/lib/slug";
import { splitPage } from "@/lib/pagination";
import { deleteImageIfManaged } from "@/server/services/upload-service";
import { notifyAdmins } from "@/server/services/notification-service";

export type CreateProductResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof CreateProductInput, string>>; formError?: string };

export type UpdateProductResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof UpdateProductInput, string>>; formError?: string };

export type ToggleStatusResult = { ok: true } | { ok: false; formError: string };
export type ModerateProductResult = { ok: true } | { ok: false; formError: string };

export async function uniqueProductSlug(name: string): Promise<string> {
  const base = slugify(name) || "product";
  let candidate = base;
  let suffix = 2;
  while (await getProductBySlug(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function createProduct(
  sellerId: string,
  input: CreateProductInput,
  images: string[]
): Promise<CreateProductResult> {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }
  const { categoryId, name, description, brand, sku, price, stockQty } = parsed.data;

  const existingSku = await getProductBySellerAndSku(sellerId, sku);
  if (existingSku) {
    return { ok: false, fieldErrors: { sku: "You already have a product with this SKU." } };
  }

  const slug = await uniqueProductSlug(name);

  await createProductForSeller(sellerId, {
    categoryId,
    sku,
    name,
    slug,
    description: description || undefined,
    brand: brand || undefined,
    images,
    price,
    stockQty,
  });

  await notifyAdmins({
    type: "product_pending_review",
    title: "Product pending review",
    body: `"${name}" was submitted and is waiting for moderation before it can go live.`,
    link: "/admin/products",
  }).catch(() => {});

  return { ok: true };
}

export function getProductForSellerEdit(sellerId: string, productId: string) {
  return getProductByIdForSeller(sellerId, productId);
}

export async function updateProduct(
  sellerId: string,
  productId: string,
  input: UpdateProductInput,
  images: string[]
): Promise<UpdateProductResult> {
  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }
  const { categoryId, name, description, brand, price, stockQty } = parsed.data;

  const before = await getProductByIdForSeller(sellerId, productId);

  const updated = await updateProductForSeller(sellerId, productId, {
    categoryId,
    name,
    description: description || undefined,
    brand: brand || undefined,
    images,
    price,
    stockQty,
  });

  if (!updated) {
    return { ok: false, formError: "Product not found." };
  }

  // Best-effort: delete any image the seller dropped from the set. Never blocks the save.
  const droppedImages = (before?.images ?? []).filter((url) => !images.includes(url));
  await Promise.all(droppedImages.map((url) => deleteImageIfManaged(url)));

  return { ok: true };
}

export async function setProductActive(
  sellerId: string,
  productId: string,
  active: boolean
): Promise<ToggleStatusResult> {
  const updated = await setProductStatusForSeller(sellerId, productId, active ? "active" : "inactive");
  if (!updated) {
    return { ok: false, formError: "Product not found." };
  }
  return { ok: true };
}

export async function listProductsForSeller(sellerId: string, page?: number) {
  const rows = await listProductsForSellerData(sellerId, { page });
  const { items, hasNextPage } = splitPage(rows);
  return { products: items, hasNextPage };
}

export function listActiveProductsForStorefront(
  opts?: {
    page?: number;
    q?: string;
    categorySlug?: string;
    minPrice?: number;
    maxPrice?: number;
    brand?: string;
    minRating?: number;
  }
) {
  return listActiveProducts(opts);
}

export function listActiveBrandsForStorefront() {
  return listDistinctActiveBrands();
}

/**
 * The one place that decides "is this publicly visible" — null if not found or not active, so
 * a draft/rejected product 404s on the storefront even if someone guesses its slug.
 */
export async function getProductForStorefront(slug: string) {
  const product = await getProductBySlug(slug);
  if (!product || product.status !== "active") return null;
  return product;
}

export async function getPendingProductsForAdmin(page?: number) {
  const rows = await listPendingProductsForAdmin({ page });
  const { items, hasNextPage } = splitPage(rows);
  return { products: items, hasNextPage };
}

export async function approveProduct(
  productId: string,
  actorUserId: string
): Promise<ModerateProductResult> {
  const updated = await approveProductForAdmin(productId);
  if (!updated) {
    return { ok: false, formError: "This product is no longer pending review." };
  }
  // Prior status is guaranteed "pending_review" by approveProductForAdmin's own verify-then-update
  // guard — no extra query needed to know the "before" value.
  await createAuditLog({
    actorUserId,
    action: "product_approved",
    entityType: "Product",
    entityId: productId,
    beforeValue: { status: "pending_review" },
    afterValue: { status: "active" },
  });
  return { ok: true };
}

export async function rejectProduct(
  productId: string,
  actorUserId: string
): Promise<ModerateProductResult> {
  const updated = await rejectProductForAdmin(productId);
  if (!updated) {
    return { ok: false, formError: "This product is no longer pending review." };
  }
  await createAuditLog({
    actorUserId,
    action: "product_rejected",
    entityType: "Product",
    entityId: productId,
    beforeValue: { status: "pending_review" },
    afterValue: { status: "rejected" },
  });
  return { ok: true };
}
