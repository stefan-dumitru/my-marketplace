"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { updateProductSchema } from "@/lib/validations/product";
import { updateProduct, type UpdateProductResult } from "@/server/services/product-service";
import { getSellerContext } from "@/server/services/seller-service";
import { checkRateLimit } from "@/server/data/rate-limit";
import { uploadImages } from "@/server/services/upload-service";
import { MAX_PRODUCT_IMAGES } from "@/lib/uploads";

export async function updateProductAction(
  productId: string,
  formData: FormData
): Promise<UpdateProductResult> {
  // Independently re-verified here — this Action is its own entry point and does not inherit
  // the (seller) layout's redirect just because the form that called it was rendered there.
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");
  const sellerId = context.profile.id;

  const rateLimit = await checkRateLimit(`product-upload:${sellerId}`, { limit: 30, windowSeconds: 600 });
  if (!rateLimit.allowed) {
    return { ok: false, formError: "Too many attempts. Please try again shortly." };
  }

  const parsed = updateProductSchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    description: formData.get("description"),
    brand: formData.get("brand"),
    price: formData.get("price"),
    stockQty: formData.get("stockQty"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  const existingImages = formData.getAll("existingImages").map(String);
  const imageFiles = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (existingImages.length + imageFiles.length > MAX_PRODUCT_IMAGES) {
    return { ok: false, formError: `You can upload at most ${MAX_PRODUCT_IMAGES} images.` };
  }

  const uploadResult = await uploadImages(
    imageFiles,
    `products/${sellerId}`,
    MAX_PRODUCT_IMAGES - existingImages.length
  );
  if (!uploadResult.ok) {
    return { ok: false, formError: uploadResult.error };
  }

  const result = await updateProduct(sellerId, productId, parsed.data, [
    ...existingImages,
    ...uploadResult.urls,
  ]);
  if (result.ok) {
    revalidatePath("/seller");
    revalidatePath(`/seller/products/${productId}/edit`);
  }
  return result;
}
