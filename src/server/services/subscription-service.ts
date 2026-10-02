import "server-only";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { logger } from "@/lib/logger";
import { queueEmail } from "@/lib/email";
import { shippingCentsForSellerCount } from "@/lib/shipping";
import { isDead, isEntitled } from "@/lib/subscription";
import { formatPrice } from "@/lib/format";
import { createAuditLog } from "@/server/data/audit-log";
import {
  findUserByStripeCustomerId,
  getSubscriptionByUserId,
  getUserBillingIdentity,
  markSubscriptionCanceled,
  setStripeCustomerIdIfUnset,
  upsertSyncedSubscription,
} from "@/server/data/subscriptions";

function baseUrl() {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

const ACCOUNT_PAGE = "/account/subscription";

// --- Shipping quote (cart / checkout display) ---

/** What shipping the buyer will be charged for a cart spanning `sellerCount` sellers. The same
 * entitlement check runs again, authoritatively, inside the checkout transaction — this one only
 * drives what the buyer is *shown*, so a stale view can never change what they are charged. */
export async function getShippingQuote(userId: string, sellerCount: number) {
  const feeCents = shippingCentsForSellerCount(sellerCount);
  const entitled = isEntitled(await getSubscriptionByUserId(userId));
  return { feeCents, chargedCents: entitled ? 0 : feeCents, waived: entitled && feeCents > 0 };
}

// --- Buyer-facing actions ---

export type RedirectResult = { ok: true; redirectUrl: string } | { ok: false; formError: string };

const UNAVAILABLE = "Subscriptions are temporarily unavailable. Please try again shortly.";

async function ensureStripeCustomer(userId: string) {
  const user = await getUserBillingIdentity(userId);
  if (!user) return null;
  if (user.stripeCustomerId) return user.stripeCustomerId;

  // The idempotency key makes a double-click (or a retry after a dropped response) return the very
  // same Stripe customer instead of creating a second one.
  const customer = await stripe.customers.create(
    { email: user.email, metadata: { userId } },
    { idempotencyKey: `customer_${userId}` }
  );
  return setStripeCustomerIdIfUnset(userId, customer.id);
}

export async function startSubscriptionCheckout(userId: string): Promise<RedirectResult> {
  const priceId = process.env.STRIPE_SUBSCRIPTION_PRICE_ID;
  if (!priceId) return { ok: false, formError: UNAVAILABLE };

  const existing = await getSubscriptionByUserId(userId);
  if (isEntitled(existing)) {
    return { ok: false, formError: "You already have an active subscription." };
  }
  if (existing && !isDead(existing.status)) {
    // Live but not entitled (past_due, unpaid, incomplete): a second subscription would double-bill.
    return { ok: false, formError: "Your subscription needs attention — use “Manage billing” to fix your payment method." };
  }

  try {
    const customerId = await ensureStripeCustomer(userId);
    if (!customerId) return { ok: false, formError: "We couldn't find your account." };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl()}${ACCOUNT_PAGE}?checkout=success`,
      cancel_url: `${baseUrl()}${ACCOUNT_PAGE}?checkout=cancelled`,
      metadata: { userId, kind: "shipping_subscription" },
      subscription_data: { metadata: { userId } },
    });
    return { ok: true, redirectUrl: session.url! };
  } catch (err) {
    logger.error({ err, userId }, "Could not start subscription checkout");
    return { ok: false, formError: UNAVAILABLE };
  }
}

/** The customer id always comes from our own database for the signed-in user — never from the
 * client — so nobody can open another account's billing portal. */
export async function openBillingPortal(userId: string): Promise<RedirectResult> {
  const user = await getUserBillingIdentity(userId);
  if (!user?.stripeCustomerId) return { ok: false, formError: "You don't have a subscription to manage." };

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl()}${ACCOUNT_PAGE}`,
    });
    return { ok: true, redirectUrl: session.url };
  } catch (err) {
    logger.error({ err, userId }, "Could not open billing portal");
    return { ok: false, formError: UNAVAILABLE };
  }
}

// --- Stripe → database sync (webhooks + page reconciliation) ---

export type SyncResult =
  | { ignored: true }
  | { ignored: false; userId: string; applied: boolean; previousStatus: string | null; status: string | null };

/**
 * Rewrites our row from a *fresh* retrieve of the subscription — the event payload is deliberately
 * not trusted for state, which makes redelivered and out-of-order events harmless (every call
 * converges on Stripe's current truth). Customers we don't know are ignored, not errors.
 */
export async function syncSubscriptionFromStripe(stripeSubscriptionId: string): Promise<SyncResult> {
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const user = await findUserByStripeCustomerId(customerId);
  if (!user) {
    logger.warn({ stripeSubscriptionId }, "Subscription event for an unknown Stripe customer — ignored");
    return { ignored: true };
  }

  // Stripe's current API keeps the billing period on the subscription items, not the subscription.
  const periodEndSeconds = sub.items.data[0]?.current_period_end;
  if (!periodEndSeconds) {
    logger.warn({ stripeSubscriptionId }, "Subscription has no billing period — ignored");
    return { ignored: true };
  }

  const result = await upsertSyncedSubscription(user.id, {
    stripeSubscriptionId: sub.id,
    status: sub.status,
    currentPeriodEnd: new Date(periodEndSeconds * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  });

  if (result.applied && result.previousStatus !== result.status) {
    await createAuditLog({
      actorUserId: null,
      action: "subscription_status_changed",
      entityType: "Subscription",
      entityId: sub.id,
      beforeValue: { status: result.previousStatus },
      afterValue: { status: result.status },
    });
  }
  return { ignored: false, userId: user.id, ...result };
}

/** invoice.payment_failed: resync, and tell the buyer once, when they actually lose the benefit. */
export async function handleSubscriptionPaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const user = await findUserByStripeCustomerId(customerId);
  if (!user) return;
  const stored = await getSubscriptionByUserId(user.id);
  if (!stored) return;

  const result = await syncSubscriptionFromStripe(stored.stripeSubscriptionId);
  if (result.ignored || !result.applied) return;

  const wasEntitled = result.previousStatus === "active" || result.previousStatus === "trialing";
  const nowEntitled = result.status === "active" || result.status === "trialing";
  if (wasEntitled && !nowEntitled) {
    const subject = "Your free shipping subscription payment failed";
    const body = `We couldn't renew your free shipping subscription, so shipping is charged on new orders until it's fixed. Update your payment method from ${baseUrl()}${ACCOUNT_PAGE}.`;
    await queueEmail({ to: user.email, subject, html: `<p>${body}</p>`, text: body }).catch(() => {});
  }
}

/** Right after returning from Stripe the webhook may not have landed yet — pull the customer's
 * latest subscription directly so the buyer sees their benefit immediately (and local dev works
 * without webhook forwarding). Best-effort: the webhook remains the main path. */
export async function reconcileSubscriptionForUser(userId: string) {
  const user = await getUserBillingIdentity(userId);
  if (!user?.stripeCustomerId) return;
  try {
    const list = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: "all", limit: 1 });
    const latest = list.data[0];
    if (latest) await syncSubscriptionFromStripe(latest.id);
  } catch (err) {
    logger.warn({ err, userId }, "Subscription reconcile failed");
  }
}

// --- GDPR erasure ---

/** Must succeed *before* the account is anonymized: otherwise we'd keep billing a person whose
 * identity we've just erased. An already-gone subscription counts as success. */
export async function cancelSubscriptionForErasure(userId: string): Promise<boolean> {
  const stored = await getSubscriptionByUserId(userId);
  if (!stored || isDead(stored.status)) return true;
  try {
    await stripe.subscriptions.cancel(stored.stripeSubscriptionId);
  } catch (err) {
    if ((err as { code?: string }).code !== "resource_missing") {
      logger.error({ err, userId }, "Could not cancel subscription during account erasure");
      return false;
    }
  }
  await markSubscriptionCanceled(userId);
  return true;
}

// --- Display ---

let priceLabelCache: { value: string | null; expires: number } | null = null;

/** "20,00 RON / month", read from the Stripe Price itself so the page can never disagree with
 * what Checkout charges. Cached briefly; null if Stripe is unreachable (page then omits the price). */
export async function getSubscriptionPriceLabel(): Promise<string | null> {
  const priceId = process.env.STRIPE_SUBSCRIPTION_PRICE_ID;
  if (!priceId) return null;
  if (priceLabelCache && priceLabelCache.expires > Date.now()) return priceLabelCache.value;
  let value: string | null = null;
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (price.unit_amount !== null && price.recurring) {
      value = `${formatPrice(price.unit_amount / 100)} / ${price.recurring.interval}`;
    }
  } catch (err) {
    logger.warn({ err }, "Could not read the subscription price from Stripe");
  }
  priceLabelCache = { value, expires: Date.now() + 10 * 60 * 1000 };
  return value;
}
