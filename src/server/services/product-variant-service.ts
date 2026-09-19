import "server-only";
import {
  productVariantSchema,
  updateVariantSchema,
  type ProductVariantInput,
  type UpdateVariantInput,
} from "@/lib/validations/product-variant";
import {
  countOrderItemsForVariant,
  countVariantsForProduct,
  createVariantForProduct,
  deleteVariantForProduct,
  getVariantBySellerAndSku,
  getVariantForProduct,
  getVariantsForProduct,
  updateVariantForProduct,
} from "@/server/data/products";

export type AddVariantResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof ProductVariantInput, string>>; formError?: string };

export type UpdateVariantResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof UpdateVariantInput, string>>; formError?: string };

export type RemoveVariantResult = { ok: true } | { ok: false; formError: string };

function attributesArrayToRecord(attributes: { key: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(attributes.map((a) => [a.key, a.value]));
}

export function getVariantsForSellerProduct(sellerId: string, productId: string) {
  return getVariantsForProduct(sellerId, productId);
}

export function getVariantForSellerProduct(sellerId: string, productId: string, variantId: string) {
  return getVariantForProduct(sellerId, productId, variantId);
}

export async function addProductVariant(
  sellerId: string,
  productId: string,
  input: ProductVariantInput
): Promise<AddVariantResult> {
  const parsed = productVariantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }
  const { sku, attributes, price, stockQty } = parsed.data;

  const existingSku = await getVariantBySellerAndSku(sellerId, sku);
  if (existingSku) {
    return { ok: false, fieldErrors: { sku: "You already have a variant with this SKU." } };
  }

  const created = await createVariantForProduct(sellerId, productId, {
    sku,
    attributes: attributesArrayToRecord(attributes),
    price,
    stockQty,
  });
  if (!created) {
    return { ok: false, formError: "Product not found." };
  }

  return { ok: true };
}

export async function updateProductVariant(
  sellerId: string,
  productId: string,
  variantId: string,
  input: UpdateVariantInput
): Promise<UpdateVariantResult> {
  const parsed = updateVariantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }
  const { attributes, price, stockQty } = parsed.data;

  const updated = await updateVariantForProduct(sellerId, productId, variantId, {
    attributes: attributesArrayToRecord(attributes),
    price,
    stockQty,
  });
  if (!updated) {
    return { ok: false, formError: "Variant not found." };
  }

  return { ok: true };
}

export async function removeProductVariant(
  sellerId: string,
  productId: string,
  variantId: string
): Promise<RemoveVariantResult> {
  // Ownership verified first — the count checks below are only meaningful (and safe to reveal
  // the reason for) once we know this variant is actually this seller's.
  const owned = await getVariantForProduct(sellerId, productId, variantId);
  if (!owned) {
    return { ok: false, formError: "Variant not found." };
  }

  const [variantCount, orderItemCount] = await Promise.all([
    countVariantsForProduct(productId),
    countOrderItemsForVariant(variantId),
  ]);

  if (variantCount <= 1) {
    return { ok: false, formError: "A product must have at least one variant." };
  }
  if (orderItemCount > 0) {
    return {
      ok: false,
      formError: "This variant has order history and can't be deleted — set its stock to 0 instead.",
    };
  }

  const deleted = await deleteVariantForProduct(sellerId, productId, variantId);
  if (!deleted) {
    return { ok: false, formError: "Variant not found." };
  }

  return { ok: true };
}
