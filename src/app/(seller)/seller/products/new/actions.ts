"use server";

import { redirect } from "next/navigation";
import { createProductSchema } from "@/lib/validations/product";
import { createProduct, type CreateProductResult } from "@/server/services/product-service";
import { getSellerContext } from "@/server/services/seller-service";
import { checkRateLimit } from "@/server/data/rate-limit";
import { uploadImages } from "@/server/services/upload-service";
import { MAX_PRODUCT_IMAGES } from "@/lib/uploads";

/** FormData carries specifications as a JSON string; absent means "not provided". */
function readSpecifications(formData: FormData): { ok: true; value: unknown } | { ok: false } {
  const raw = formData.get("specifications");
  if (raw === null) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(String(raw)) };
  } catch {
    return { ok: false };
  }
}

export async function createProductAction(formData: FormData): Promise<CreateProductResult> {
  // Independently re-verified here — this Action is its own entry point and does not inherit
  // the (seller) layout's redirect just because the form that called it was rendered there.
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");
  const sellerId = context.profile.id;

  // Keyed by seller — these actions now do real upload work, so they're rate-limited like the
  // other "expensive endpoints" CLAUDE.md's security baseline calls out (login, checkout).
  const rateLimit = await checkRateLimit(`product-upload:${sellerId}`, { limit: 30, windowSeconds: 600 });
  if (!rateLimit.allowed) {
    return { ok: false, formError: "Too many attempts. Please try again shortly." };
  }

  const specs = readSpecifications(formData);
  if (!specs.ok) return { ok: false, formError: "Specifications were not valid. Please try again." };

  const parsed = createProductSchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    description: formData.get("description"),
    brand: formData.get("brand"),
    sku: formData.get("sku"),
    price: formData.get("price"),
    stockQty: formData.get("stockQty"),
    specifications: specs.value,
  });
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  const imageFiles = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (imageFiles.length > MAX_PRODUCT_IMAGES) {
    return { ok: false, formError: `You can upload at most ${MAX_PRODUCT_IMAGES} images.` };
  }

  const uploadResult = await uploadImages(imageFiles, `products/${sellerId}`, MAX_PRODUCT_IMAGES);
  if (!uploadResult.ok) {
    return { ok: false, formError: uploadResult.error };
  }

  return createProduct(sellerId, parsed.data, uploadResult.urls);
}
