import "server-only";
import bcrypt from "bcryptjs";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { createUser, getUserByEmail, markEmailVerified } from "@/server/data/users";
import { createVerificationToken, consumeVerificationToken } from "@/server/data/verification-tokens";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const BCRYPT_COST = 12;

export type RegisterResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof RegisterInput, string>>; formError?: string };

async function sendVerificationEmail(email: string) {
  const token = await createVerificationToken(email);
  const verifyUrl = `${process.env.NEXTAUTH_URL}/auth/verify-email?email=${encodeURIComponent(
    email
  )}&token=${token}`;

  // A delivery failure (provider down, sandbox-restricted recipient, etc.) must not fail
  // registration itself — the account is still created either way, and ResendVerificationButton
  // already gives the user a retry path. See operations.md > External Integrations: "the
  // underlying action still completes... not blocking."
  try {
    await sendEmail({
      to: email,
      subject: "Verify your email",
      html: `<p>Confirm your email to finish setting up your account.</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
      text: `Confirm your email to finish setting up your account: ${verifyUrl}`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send verification email");
  }
}

export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Invalid input." };
  }
  const { email, password, name, phone } = parsed.data;

  const existing = await getUserByEmail(email);
  if (existing) {
    return {
      ok: false,
      fieldErrors: { email: "This email is already registered — try logging in instead." },
    };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await createUser({ email, passwordHash, name, phone: phone || undefined, role: "buyer" });

  await sendVerificationEmail(email);

  return { ok: true };
}

export async function resendVerificationEmail(email: string) {
  const user = await getUserByEmail(email);
  // Don't reveal whether the email exists — same response either way (mirrors the login
  // enumeration protection; see security.md > Authentication).
  if (!user || user.emailVerifiedAt) return;
  await sendVerificationEmail(email);
}

export async function verifyEmailToken(email: string, token: string): Promise<boolean> {
  const valid = await consumeVerificationToken(email, token);
  if (!valid) return false;

  const user = await getUserByEmail(email);
  if (!user) return false;

  await markEmailVerified(user.id);
  return true;
}
