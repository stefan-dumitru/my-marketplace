"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addProductVariant,
  removeProductVariant,
  updateProductVariant,
  type AddVariantResult,
  type RemoveVariantResult,
  type UpdateVariantResult,
} from "@/server/services/product-variant-service";
import { getSellerContext } from "@/server/services/seller-service";
import type { ProductVariantInput, UpdateVariantInput } from "@/lib/validations/product-variant";

async function requireApprovedSeller() {
  // Independently re-verified here — this Action is its own entry point, not protected by the
  // (seller) layout's redirect just because the page that rendered its form was.
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");
  return context.profile.id;
}

export async function addVariantAction(
  productId: string,
  input: ProductVariantInput
): Promise<AddVariantResult> {
  const sellerId = await requireApprovedSeller();
  const result = await addProductVariant(sellerId, productId, input);
  if (result.ok) {
    revalidatePath(`/seller/products/${productId}/variants`);
    revalidatePath("/seller");
  }
  return result;
}

export async function updateVariantAction(
  productId: string,
  variantId: string,
  input: UpdateVariantInput
): Promise<UpdateVariantResult> {
  const sellerId = await requireApprovedSeller();
  const result = await updateProductVariant(sellerId, productId, variantId, input);
  if (result.ok) {
    revalidatePath(`/seller/products/${productId}/variants`);
    revalidatePath("/seller");
  }
  return result;
}

export async function deleteVariantAction(
  productId: string,
  variantId: string
): Promise<RemoveVariantResult> {
  const sellerId = await requireApprovedSeller();
  const result = await removeProductVariant(sellerId, productId, variantId);
  if (result.ok) {
    revalidatePath(`/seller/products/${productId}/variants`);
    revalidatePath("/seller");
  }
  return result;
}
