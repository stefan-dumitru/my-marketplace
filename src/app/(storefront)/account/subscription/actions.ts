"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/server/data/rate-limit";
import { openBillingPortal, startSubscriptionCheckout, type RedirectResult } from "@/server/services/subscription-service";

const LOGIN = "/auth/login?callbackUrl=/account/subscription";

export async function subscribeAction(): Promise<RedirectResult> {
  // Independently re-verified — this Action is its own entry point, not protected by the page.
  const session = await auth();
  if (!session) redirect(LOGIN);
  // Same bar as checkout: no taking payments from an address we haven't verified.
  if (!session.user.emailVerifiedAt) {
    return { ok: false, formError: "Verify your email before subscribing." };
  }

  const rateLimit = await checkRateLimit(`subscribe:${session.user.id}`, { limit: 10, windowSeconds: 900 });
  if (!rateLimit.allowed) return { ok: false, formError: "Too many attempts. Please try again shortly." };

  return startSubscriptionCheckout(session.user.id);
}

export async function manageBillingAction(): Promise<RedirectResult> {
  const session = await auth();
  if (!session) redirect(LOGIN);

  const rateLimit = await checkRateLimit(`billing-portal:${session.user.id}`, { limit: 20, windowSeconds: 900 });
  if (!rateLimit.allowed) return { ok: false, formError: "Too many attempts. Please try again shortly." };

  return openBillingPortal(session.user.id);
}
