"use server";

import { resendVerificationEmail, verifyEmailToken } from "@/server/services/auth-service";

export async function resendVerificationAction(email: string) {
  await resendVerificationEmail(email);
}

export async function verifyEmailAction(email: string, token: string) {
  return verifyEmailToken(email, token);
}
