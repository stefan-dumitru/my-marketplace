import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  registerUser,
  requestPasswordReset,
  resetPassword,
  resolveOAuthUser,
} from "@/server/services/auth-service";
import { checkRateLimit } from "@/server/data/rate-limit";
import { createPasswordResetToken } from "@/server/data/password-reset-tokens";
import { createBuyer } from "@test/helpers";

const VALID_INPUT = {
  email: "buyer@example.com",
  password: "correct-Horse1",
  name: "Test Buyer",
  phone: "",
};

describe("registerUser", () => {
  it("creates an unverified user", async () => {
    const result = await registerUser(VALID_INPUT);

    expect(result.ok).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: VALID_INPUT.email } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.role).toBe("buyer");
  });

  it("rejects a duplicate email", async () => {
    await registerUser(VALID_INPUT);

    const result = await registerUser(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.email).toBeTruthy();
    }
    expect(await prisma.user.count({ where: { email: VALID_INPUT.email } })).toBe(1);
  });
});

describe("login rate limiting (src/lib/auth.ts's authorize() uses this exact key/limit)", () => {
  it("locks out after 5 failed attempts within the window", async () => {
    const key = "login:locktest@example.com";

    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(key, { limit: 5, windowSeconds: 900 });
      expect(result.allowed).toBe(true);
    }

    const sixth = await checkRateLimit(key, { limit: 5, windowSeconds: 900 });

    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("does not lock out a different email", async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit("login:one@example.com", { limit: 5, windowSeconds: 900 });
    }

    const result = await checkRateLimit("login:two@example.com", { limit: 5, windowSeconds: 900 });

    expect(result.allowed).toBe(true);
  });
});

describe("requestPasswordReset", () => {
  it("is a silent no-op for an email with no account (no enumeration signal)", async () => {
    await expect(requestPasswordReset("nobody@example.com")).resolves.toBeUndefined();
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("issues a token for a real account", async () => {
    const buyer = await createBuyer();

    await requestPasswordReset(buyer.email);

    const token = await prisma.passwordResetToken.findFirst({ where: { identifier: buyer.email } });
    expect(token).not.toBeNull();
  });

  it("replaces any previously issued token for the same email", async () => {
    const buyer = await createBuyer();
    await requestPasswordReset(buyer.email);
    const first = await prisma.passwordResetToken.findFirstOrThrow({ where: { identifier: buyer.email } });

    await requestPasswordReset(buyer.email);

    const remaining = await prisma.passwordResetToken.findMany({ where: { identifier: buyer.email } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].token).not.toBe(first.token);
  });
});

const NEW_PASSWORD = { password: "correct-Horse2", confirmPassword: "correct-Horse2" };

describe("resetPassword", () => {
  it("updates the password hash and bumps sessionVersion (logs out other sessions)", async () => {
    const buyer = await createBuyer();
    const token = await createPasswordResetToken(buyer.email);

    const result = await resetPassword(buyer.email, token, NEW_PASSWORD);

    expect(result.ok).toBe(true);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } });
    // Non-null: resetPassword always writes a real hash for a Credentials-registered buyer.
    expect(await bcrypt.compare(NEW_PASSWORD.password, updated.passwordHash!)).toBe(true);
    expect(updated.sessionVersion).toBe(buyer.sessionVersion + 1);
  });

  it("can only be used once — a second attempt with the same token fails", async () => {
    const buyer = await createBuyer();
    const token = await createPasswordResetToken(buyer.email);
    await resetPassword(buyer.email, token, NEW_PASSWORD);

    const second = await resetPassword(buyer.email, token, { password: "another-Pass3", confirmPassword: "another-Pass3" });

    expect(second.ok).toBe(false);
  });

  it("rejects an expired or unknown token", async () => {
    const buyer = await createBuyer();

    const result = await resetPassword(buyer.email, "not-a-real-token", NEW_PASSWORD);

    expect(result.ok).toBe(false);
  });

  it("rejects mismatched confirm-password before touching the token", async () => {
    const buyer = await createBuyer();
    const token = await createPasswordResetToken(buyer.email);

    const result = await resetPassword(buyer.email, token, {
      password: "correct-Horse2",
      confirmPassword: "different-Horse2",
    });

    expect(result.ok).toBe(false);
    // The token must still be valid — a client-side validation failure shouldn't burn it.
    const stillThere = await prisma.passwordResetToken.findFirst({ where: { identifier: buyer.email, token } });
    expect(stillThere).not.toBeNull();
  });
});

describe("resolveOAuthUser (Google sign-in's lookup-or-create — see lib/auth.ts's profile())", () => {
  it("creates a new account with no password and an already-verified email", async () => {
    const user = await resolveOAuthUser("new-oauth-buyer@example.com", "OAuth Buyer");

    expect(user.passwordHash).toBeNull();
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.role).toBe("buyer");
    expect(await prisma.user.count({ where: { email: "new-oauth-buyer@example.com" } })).toBe(1);
  });

  it("links to an existing account with the same email instead of creating a duplicate", async () => {
    const existing = await createBuyer();

    const resolved = await resolveOAuthUser(existing.email, "Different Display Name");

    expect(resolved.id).toBe(existing.id);
    expect(await prisma.user.count({ where: { email: existing.email } })).toBe(1);
  });

  it("is case-insensitive on email, matching the existing account either way", async () => {
    const existing = await createBuyer();

    const resolved = await resolveOAuthUser(existing.email.toUpperCase(), "Someone");

    expect(resolved.id).toBe(existing.id);
  });

  it("rejects a suspended account instead of logging it in", async () => {
    const buyer = await createBuyer();
    await prisma.user.update({ where: { id: buyer.id }, data: { status: "suspended" } });

    await expect(resolveOAuthUser(buyer.email, buyer.name)).rejects.toThrow(/suspended/i);
  });
});
