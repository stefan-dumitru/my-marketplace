import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerUser } from "@/server/services/auth-service";
import { checkRateLimit } from "@/server/data/rate-limit";

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
