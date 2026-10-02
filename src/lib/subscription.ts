// Pure subscription rules — no I/O, shared by checkout (the waiver decision), the account page and
// the webhook sync, so "does this buyer get free shipping" has exactly one definition.

/** Stripe statuses that grant the benefit. past_due / unpaid / incomplete / paused do NOT: a failed
 * renewal stops the free shipping immediately rather than extending credit. */
const ENTITLED_STATUSES = new Set(["active", "trialing"]);

/** Terminal statuses — the subscription is over and a new one may be started. */
const DEAD_STATUSES = new Set(["canceled", "incomplete_expired"]);

export type SubscriptionState = { status: string; currentPeriodEnd: Date };

/** Free shipping applies only while the status is active/trialing AND the paid period hasn't
 * ended — the date check guards against a missed "ended" webhook leaving the benefit on forever. */
export function isEntitled(sub: SubscriptionState | null | undefined, now: Date = new Date()) {
  return !!sub && ENTITLED_STATUSES.has(sub.status) && sub.currentPeriodEnd > now;
}

export function isDead(status: string) {
  return DEAD_STATUSES.has(status);
}

/**
 * Decides whether an incoming Stripe subscription may overwrite the stored row. A user has one row,
 * but can subscribe again after cancelling (a NEW Stripe subscription id), and webhooks arrive out
 * of order: a late event for the old, cancelled subscription must never clobber the new live one.
 */
export function shouldReplaceStored(
  stored: { stripeSubscriptionId: string; status: string } | null,
  incoming: { stripeSubscriptionId: string; status: string }
) {
  if (!stored) return true;
  if (stored.stripeSubscriptionId === incoming.stripeSubscriptionId) return true;
  // A different subscription: only take over if the stored one is finished, or the new one is live.
  return isDead(stored.status) || !isDead(incoming.status);
}
