"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSellerContext } from "@/server/services/seller-service";
import {
  importProducts,
  IMPORT_FILE_LIMITS,
  type ImportProductsResult,
} from "@/server/services/product-import-service";
import { importModeSchema } from "@/lib/validations/product-import";
import { checkRateLimit } from "@/server/data/rate-limit";

export async function importProductsAction(formData: FormData): Promise<ImportProductsResult> {
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller/products/import");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");

  // Large batches enqueue an Inngest background job and send a completion email.
  const rateLimit = await checkRateLimit(`product-import:${context.profile.id}`, {
    limit: 10,
    windowSeconds: 600,
  });
  if (!rateLimit.allowed) {
    return { ok: false, formError: "Too many attempts. Please try again shortly." };
  }

  const modeParsed = importModeSchema.safeParse(formData.get("mode"));
  if (!modeParsed.success) {
    return { ok: false, formError: "Select an import mode." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, formError: "Choose a CSV file to upload." };
  }
  if (file.size > IMPORT_FILE_LIMITS.maxFileBytes) {
    return { ok: false, formError: "File is too large (max 2MB)." };
  }

  const csvText = await file.text();
  const result = await importProducts(
    context.profile.id,
    context.session.user.id,
    context.session.user.email ?? "",
    modeParsed.data,
    csvText
  );

  revalidatePath("/seller/products/import");
  return result;
}
