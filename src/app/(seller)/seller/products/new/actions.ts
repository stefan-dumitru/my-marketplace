"use server";

import { redirect } from "next/navigation";
import { createProductSchema, type CreateProductInput } from "@/lib/validations/product";
import { createProduct, type CreateProductResult } from "@/server/services/product-service";
import { getSellerContext } from "@/server/services/seller-service";

export async function createProductAction(input: CreateProductInput): Promise<CreateProductResult> {
  // Independently re-verified here — this Action is its own entry point and does not inherit
  // the (seller) layout's redirect just because the form that called it was rendered there.
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");

  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  return createProduct(context.profile.id, parsed.data);
}
