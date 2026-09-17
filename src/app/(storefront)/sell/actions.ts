"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { sellerApplicationSchema, type SellerApplicationInput } from "@/lib/validations/seller";
import { applyForSellerAccount, type ApplyResult } from "@/server/services/seller-service";

export async function applySellerAction(input: SellerApplicationInput): Promise<ApplyResult> {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/sell");

  const parsed = sellerApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  // userId always comes from the session, never from client input.
  return applyForSellerAccount(session.user.id, parsed.data);
}
