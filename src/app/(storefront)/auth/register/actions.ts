"use server";

import { headers } from "next/headers";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { registerUser, type RegisterResult } from "@/server/services/auth-service";
import { checkRateLimit } from "@/server/data/rate-limit";

export async function registerAction(input: RegisterInput): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  // IP-keyed, not email-keyed — there's no account yet to key by. Vercel sets x-forwarded-for;
  // local dev falls back to a shared bucket, which is fine for local testing.
  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
  const rateLimit = await checkRateLimit(`register:${ip}`, { limit: 10, windowSeconds: 3600 });
  if (!rateLimit.allowed) {
    return { ok: false, formError: "Too many attempts. Please try again in a few minutes." };
  }

  return registerUser(parsed.data);
}
