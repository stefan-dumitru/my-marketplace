import { describe, expect, it, vi } from "vitest";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { createOnboardingLink, reconcileConnectStatus } from "@/server/services/connect-service";
import { createApprovedSeller } from "@test/helpers";

vi.mock("@/lib/stripe", () => ({
  stripe: {
    accounts: { create: vi.fn(async () => ({ id: "acct_new" })), retrieve: vi.fn() },
    accountLinks: { create: vi.fn(async () => ({ url: "https://stripe.test/onboarding" })) },
  },
}));

const accountsCreate = vi.mocked(stripe.accounts.create);
const accountsRetrieve = vi.mocked(stripe.accounts.retrieve);
const accountLinksCreate = vi.mocked(stripe.accountLinks.create);

describe("createOnboardingLink", () => {
  it("creates a Connect account on first use, stores it and returns the onboarding link", async () => {
    const { profile, user } = await createApprovedSeller();

    const result = await createOnboardingLink(profile.id, user.email);

    expect(result).toEqual({ ok: true, redirectUrl: "https://stripe.test/onboarding" });
    expect(accountsCreate).toHaveBeenCalledWith(expect.objectContaining({ type: "express", email: user.email }));
    expect((await prisma.sellerProfile.findUniqueOrThrow({ where: { id: profile.id } })).stripeConnectAccountId).toBe("acct_new");
    expect(accountLinksCreate).toHaveBeenCalledWith(expect.objectContaining({ account: "acct_new", type: "account_onboarding" }));
  });

  it("reuses the existing account instead of creating a second one", async () => {
    const { profile, user } = await createApprovedSeller();
    await createOnboardingLink(profile.id, user.email);
    await createOnboardingLink(profile.id, user.email);

    expect(accountsCreate).toHaveBeenCalledTimes(1);
    expect(accountLinksCreate).toHaveBeenCalledTimes(2);
  });

  it("returns a friendly error when Stripe fails", async () => {
    const { profile, user } = await createApprovedSeller();
    accountsCreate.mockRejectedValueOnce(new Error("stripe down"));

    const result = await createOnboardingLink(profile.id, user.email);

    expect(result.ok).toBe(false);
    expect((await prisma.sellerProfile.findUniqueOrThrow({ where: { id: profile.id } })).stripeConnectAccountId).toBeNull();
  });
});

describe("reconcileConnectStatus", () => {
  it("is false when the seller never started onboarding", async () => {
    const { profile } = await createApprovedSeller();
    expect(await reconcileConnectStatus(profile.id)).toBe(false);
    expect(accountsRetrieve).not.toHaveBeenCalled();
  });

  it("trusts the stored flag without calling Stripe when payouts are already enabled", async () => {
    const { profile } = await createApprovedSeller({ payoutsEnabled: true });
    await prisma.sellerProfile.update({ where: { id: profile.id }, data: { stripeConnectAccountId: "acct_1" } });

    expect(await reconcileConnectStatus(profile.id)).toBe(true);
    expect(accountsRetrieve).not.toHaveBeenCalled();
  });

  it("checks Stripe directly and enables payouts once onboarding has finished", async () => {
    const { profile } = await createApprovedSeller();
    await prisma.sellerProfile.update({ where: { id: profile.id }, data: { stripeConnectAccountId: "acct_1" } });
    accountsRetrieve.mockResolvedValueOnce({ payouts_enabled: true } as never);

    expect(await reconcileConnectStatus(profile.id)).toBe(true);
    expect((await prisma.sellerProfile.findUniqueOrThrow({ where: { id: profile.id } })).payoutsEnabled).toBe(true);
  });

  it("stays disabled while Stripe says onboarding is incomplete", async () => {
    const { profile } = await createApprovedSeller();
    await prisma.sellerProfile.update({ where: { id: profile.id }, data: { stripeConnectAccountId: "acct_1" } });
    accountsRetrieve.mockResolvedValueOnce({ payouts_enabled: false } as never);

    expect(await reconcileConnectStatus(profile.id)).toBe(false);
    expect((await prisma.sellerProfile.findUniqueOrThrow({ where: { id: profile.id } })).payoutsEnabled).toBe(false);
  });

  it("falls back to the last known state when Stripe is unreachable", async () => {
    const { profile } = await createApprovedSeller();
    await prisma.sellerProfile.update({ where: { id: profile.id }, data: { stripeConnectAccountId: "acct_1" } });
    accountsRetrieve.mockRejectedValueOnce(new Error("network"));

    expect(await reconcileConnectStatus(profile.id)).toBe(false);
  });
});
