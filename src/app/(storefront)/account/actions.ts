"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/server/data/rate-limit";
import { deleteOwnAccount, type DeleteAccountResult } from "@/server/services/account-service";

export async function deleteAccountAction(confirmEmail: string): Promise<DeleteAccountResult> {
  // Independently re-verified — this Action is its own entry point, not protected by the page
  // that rendered the form that called it.
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/account");

  const rateLimit = await checkRateLimit(`account-delete:${session.user.id}`, {
    limit: 5,
    windowSeconds: 900,
  });
  if (!rateLimit.allowed) {
    return { ok: false, formError: "Too many attempts. Please try again shortly." };
  }

  // Typed-confirmation check is re-done server-side — the client disabling its own button is UX,
  // not the control.
  const sessionEmail = session.user.email ?? "";
  if (confirmEmail.trim().toLowerCase() !== sessionEmail.toLowerCase()) {
    return { ok: false, formError: "The email you typed doesn't match your account email." };
  }

  return deleteOwnAccount(session.user.id);
}
