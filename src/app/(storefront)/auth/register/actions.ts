"use server";

import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { registerUser, type RegisterResult } from "@/server/services/auth-service";

export async function registerAction(input: RegisterInput): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }
  return registerUser(parsed.data);
}
