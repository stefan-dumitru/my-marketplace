import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, peekRateLimitCount, resetRateLimit } from "@/server/data/rate-limit";

const opts = { limit: 3, windowSeconds: 60 };

describe("checkRateLimit", () => {
  it("allows requests up to the limit, then blocks with a retry hint", async () => {
    for (let i = 0; i < 3; i++) {
      expect(await checkRateLimit("k", opts)).toEqual({ allowed: true });
    }

    const blocked = await checkRateLimit("k", opts);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("counts each key separately", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit("a", opts);

    expect((await checkRateLimit("a", opts)).allowed).toBe(false);
    expect((await checkRateLimit("b", opts)).allowed).toBe(true);
  });

  it("starts a fresh window once the old one has expired", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit("k", opts);
    await prisma.rateLimitBucket.update({ where: { key: "k" }, data: { windowEnds: new Date(Date.now() - 1000) } });

    expect(await checkRateLimit("k", opts)).toEqual({ allowed: true });
    expect(await peekRateLimitCount("k")).toBe(1);
  });
});

describe("peekRateLimitCount", () => {
  it("reads the count without incrementing it, and ignores an expired window", async () => {
    expect(await peekRateLimitCount("k")).toBe(0);
    await checkRateLimit("k", opts);
    await checkRateLimit("k", opts);

    expect(await peekRateLimitCount("k")).toBe(2);
    expect(await peekRateLimitCount("k")).toBe(2);

    await prisma.rateLimitBucket.update({ where: { key: "k" }, data: { windowEnds: new Date(Date.now() - 1000) } });
    expect(await peekRateLimitCount("k")).toBe(0);
  });
});

describe("resetRateLimit", () => {
  it("clears a blocked bucket so the key can be used again", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit("login:x", opts);
    expect((await checkRateLimit("login:x", opts)).allowed).toBe(false);

    await resetRateLimit("login:x");

    expect(await peekRateLimitCount("login:x")).toBe(0);
    expect((await checkRateLimit("login:x", opts)).allowed).toBe(true);
  });

  it("only touches the given key and is harmless when the key does not exist", async () => {
    await checkRateLimit("keep", opts);

    await resetRateLimit("never-existed");
    await resetRateLimit("other");

    expect(await peekRateLimitCount("keep")).toBe(1);
  });
});
