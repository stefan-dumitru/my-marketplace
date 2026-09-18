"use server";

import { redirect } from "next/navigation";
import { createOnboardingLink } from "@/server/services/connect-service";
import { getSellerContext } from "@/server/services/seller-service";

export async function startOnboardingAction() {
  // Independently re-verified here — this Action is its own entry point, not protected by the
  // (seller) layout's redirect just because the page that rendered its button was.
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller/payouts");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");

  const result = await createOnboardingLink(context.profile.id, context.session.user.email ?? "");
  if (result.ok) {
    redirect(result.redirectUrl);
  }
  return result;
}
