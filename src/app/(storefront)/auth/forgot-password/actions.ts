"use server";

import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations/auth";
import { requestPasswordReset } from "@/server/services/auth-service";
import { checkRateLimit } from "@/server/data/rate-limit";

export async function forgotPasswordAction(input: ForgotPasswordInput) {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return;

  const { email } = parsed.data;

  // Same "don't reveal whether the account exists" posture as resend-verification — no signal
  // back to the caller either way, so this rate limit exists purely to slow down mass-requesting
  // reset emails for arbitrary addresses, not to protect a response the caller can already see.
  const rateLimit = await checkRateLimit(`forgot-password:${email}`, { limit: 3, windowSeconds: 900 });
  if (!rateLimit.allowed) return;

  await requestPasswordReset(email);
}
