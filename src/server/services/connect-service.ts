import "server-only";
import { stripe } from "@/lib/stripe";
import {
  getSellerProfileById,
  setSellerPayoutsEnabled,
  setSellerStripeAccount,
} from "@/server/data/seller-profiles";

export type OnboardingLinkResult = { ok: true; redirectUrl: string } | { ok: false; formError: string };

function baseUrl() {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

/** Returns the seller's existing Connect account id, creating one on first call. */
async function getOrCreateConnectAccount(sellerId: string, email: string): Promise<string> {
  const profile = await getSellerProfileById(sellerId);
  if (profile?.stripeConnectAccountId) return profile.stripeConnectAccountId;

  const account = await stripe.accounts.create({
    type: "express",
    email,
    capabilities: { transfers: { requested: true } },
  });
  await setSellerStripeAccount(sellerId, account.id);
  return account.id;
}

export async function createOnboardingLink(
  sellerId: string,
  email: string
): Promise<OnboardingLinkResult> {
  try {
    const accountId = await getOrCreateConnectAccount(sellerId, email);
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl()}/seller/payouts`,
      return_url: `${baseUrl()}/seller/payouts`,
      type: "account_onboarding",
    });
    return { ok: true, redirectUrl: accountLink.url };
  } catch {
    return { ok: false, formError: "Couldn't start Stripe onboarding. Please try again shortly." };
  }
}

/**
 * Self-healing status check: if the DB hasn't caught up with the webhook yet (e.g. the seller
 * just bounced back from Stripe's hosted onboarding), check Stripe directly rather than making
 * them wait on webhook delivery. The account.updated webhook (route.ts) is the background sync
 * for everywhere else this page isn't being actively viewed.
 */
export async function reconcileConnectStatus(sellerId: string): Promise<boolean> {
  const profile = await getSellerProfileById(sellerId);
  if (!profile?.stripeConnectAccountId) return false;
  if (profile.payoutsEnabled) return true;

  try {
    const account = await stripe.accounts.retrieve(profile.stripeConnectAccountId);
    if (account.payouts_enabled) {
      await setSellerPayoutsEnabled(profile.stripeConnectAccountId, true);
      return true;
    }
  } catch {
    // Best-effort reconciliation — if Stripe is unreachable, fall back to the last known DB
    // state rather than failing the whole page load.
  }
  return false;
}
