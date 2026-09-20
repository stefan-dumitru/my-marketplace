"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { sellerApplicationSchema } from "@/lib/validations/seller";
import { applyForSellerAccount, type ApplyResult } from "@/server/services/seller-service";
import { uploadImage } from "@/server/services/upload-service";

export async function applySellerAction(formData: FormData): Promise<ApplyResult> {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/sell");

  const parsed = sellerApplicationSchema.safeParse({
    storeName: formData.get("storeName"),
    description: formData.get("description"),
    businessRegistrationNumber: formData.get("businessRegistrationNumber"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  const logoFile = formData.get("logo");
  let logoUrl: string | null = null;
  if (logoFile instanceof File && logoFile.size > 0) {
    const uploadResult = await uploadImage(logoFile, "sellers/logos");
    if (!uploadResult.ok) {
      return { ok: false, formError: uploadResult.error };
    }
    logoUrl = uploadResult.url;
  }

  // userId always comes from the session, never from client input.
  return applyForSellerAccount(session.user.id, parsed.data, logoUrl);
}
