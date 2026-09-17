"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { setProductActive, type ToggleStatusResult } from "@/server/services/product-service";
import { getSellerContext } from "@/server/services/seller-service";

export async function toggleProductStatusAction(
  productId: string,
  nextActive: boolean
): Promise<ToggleStatusResult> {
  // Independently re-verified here — this Action is its own entry point, not protected by the
  // (seller) layout's redirect just because the dashboard that rendered its button was.
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");

  const result = await setProductActive(context.profile.id, productId, nextActive);
  revalidatePath("/seller");
  return result;
}
