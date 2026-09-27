"use server";

import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/auth";
import { resetPassword, type ResetPasswordResult } from "@/server/services/auth-service";
import { checkRateLimit } from "@/server/data/rate-limit";

export async function resetPasswordAction(
  email: string,
  token: string,
  input: ResetPasswordInput
): Promise<ResetPasswordResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  // Keyed by email, not token — caps repeated token guesses against one account, same as
  // verify-email's verify rate limit.
  const rateLimit = await checkRateLimit(`reset-password:${email}`, { limit: 10, windowSeconds: 900 });
  if (!rateLimit.allowed) {
    return { ok: false, formError: "Too many attempts. Please try again in a few minutes." };
  }

  return resetPassword(email, token, parsed.data);
}
