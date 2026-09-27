import "server-only";
import bcrypt from "bcryptjs";
import { registerSchema, resetPasswordSchema, type RegisterInput, type ResetPasswordInput } from "@/lib/validations/auth";
import { createUser, getUserByEmail, markEmailVerified, setPasswordAndBumpSessionVersion } from "@/server/data/users";
import { createVerificationToken, consumeVerificationToken } from "@/server/data/verification-tokens";
import {
  createPasswordResetToken,
  consumePasswordResetToken,
} from "@/server/data/password-reset-tokens";
import { queueEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

// Exported so account-service.ts hashes the throwaway password it writes during GDPR
// anonymization at the same cost factor — one source of truth for the policy (security.md).
export const BCRYPT_COST = 12;

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
  // underlying action still completes... not blocking." The actual send now happens off the
  // request path via queueEmail (see lib/email.ts) — only the enqueue itself is guarded here.
  try {
    await queueEmail({
      to: email,
      subject: "Verify your email",
      html: `<p>Confirm your email to finish setting up your account.</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
      text: `Confirm your email to finish setting up your account: ${verifyUrl}`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to queue verification email");
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

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof ResetPasswordInput, string>>; formError?: string };

/**
 * Silent no-op for a nonexistent (or anonymized — see users.ts's anonymizeUserById, which
 * rewrites email to `deleted-*@anonymized.invalid` so it can never match a real request here)
 * email, same "don't reveal whether the account exists" posture as resendVerificationEmail below.
 */
export async function requestPasswordReset(email: string) {
  const user = await getUserByEmail(email);
  if (!user) return;

  const token = await createPasswordResetToken(email);
  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?email=${encodeURIComponent(
    email
  )}&token=${token}`;

  // Same "delivery failure must not fail the caller" reasoning as sendVerificationEmail above —
  // the token already exists either way, and the user can request another link.
  try {
    await queueEmail({
      to: email,
      subject: "Reset your password",
      html: `<p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      text: `Reset your password (expires in 1 hour): ${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to queue password reset email");
  }
}

export async function resetPassword(
  email: string,
  token: string,
  input: ResetPasswordInput
): Promise<ResetPasswordResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  const valid = await consumePasswordResetToken(email, token);
  if (!valid) {
    return { ok: false, formError: "This link is invalid or has expired." };
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return { ok: false, formError: "This link is invalid or has expired." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_COST);
  // Bumps sessionVersion so every other device/session is logged out — a password reset is
  // exactly the kind of privilege-adjacent event CLAUDE.md's Security Baseline calls out
  // ("sessions must be revocable... on... privilege change"), and matches the same pattern
  // GDPR anonymization already uses for the same reason.
  await setPasswordAndBumpSessionVersion(user.id, passwordHash);

  return { ok: true };
}
