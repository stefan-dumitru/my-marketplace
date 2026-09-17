"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { updateProductSchema, type UpdateProductInput } from "@/lib/validations/product";
import { updateProduct, type UpdateProductResult } from "@/server/services/product-service";
import { getSellerContext } from "@/server/services/seller-service";

export async function updateProductAction(
  productId: string,
  input: UpdateProductInput
): Promise<UpdateProductResult> {
  // Independently re-verified here — this Action is its own entry point and does not inherit
  // the (seller) layout's redirect just because the form that called it was rendered there.
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");

  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  const result = await updateProduct(context.profile.id, productId, parsed.data);
  if (result.ok) {
    revalidatePath("/seller");
    revalidatePath(`/seller/products/${productId}/edit`);
  }
  return result;
}
