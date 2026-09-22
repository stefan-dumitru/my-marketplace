"use server";

import { resendVerificationEmail, verifyEmailToken } from "@/server/services/auth-service";
import { checkRateLimit } from "@/server/data/rate-limit";

export async function resendVerificationAction(email: string) {
  // Same "don't reveal whether the account exists" posture as a rejected send — no signal back
  // to the caller either way.
  const rateLimit = await checkRateLimit(`verify-email-resend:${email}`, { limit: 3, windowSeconds: 900 });
  if (!rateLimit.allowed) return;

  await resendVerificationEmail(email);
}

export async function verifyEmailAction(email: string, token: string) {
  // Keyed by the target email so repeated token guesses against one account are capped.
  const rateLimit = await checkRateLimit(`verify-email-verify:${email}`, { limit: 10, windowSeconds: 900 });
  if (!rateLimit.allowed) return false;

  return verifyEmailToken(email, token);
}
