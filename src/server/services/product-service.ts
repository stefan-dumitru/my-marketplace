import "server-only";
import { createProductSchema, type CreateProductInput } from "@/lib/validations/product";
import {
  createProductForSeller,
  getProductBySellerAndSku,
  getProductBySlug,
  listActiveProducts,
  listProductsForSeller as listProductsForSellerData,
} from "@/server/data/products";
import { slugify } from "@/lib/slug";

export type CreateProductResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof CreateProductInput, string>>; formError?: string };

async function uniqueProductSlug(name: string): Promise<string> {
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
  input: CreateProductInput
): Promise<CreateProductResult> {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }
  const { categoryId, name, description, brand, sku, imageUrl, price, stockQty } = parsed.data;

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
    images: imageUrl ? [imageUrl] : [],
    price,
    stockQty,
  });

  return { ok: true };
}

export function listProductsForSeller(sellerId: string) {
  return listProductsForSellerData(sellerId);
}

export function listActiveProductsForStorefront(opts?: { take?: number }) {
  return listActiveProducts(opts);
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
