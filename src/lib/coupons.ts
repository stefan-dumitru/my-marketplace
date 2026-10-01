// Pure coupon rules — no I/O, so the exact same logic runs for the cart preview, the checkout
// transaction, and the tests. All money math here is in integer cents: summing floats (the way
// line totals are computed elsewhere) drifts by fractions of a cent, and a discount that is off by
// one cent from what Stripe charges is exactly the bug this module exists to rule out.

/** Stripe's minimum charge for RON. A coupon may never push the payable total below this — a
 * Checkout Session for less is rejected outright, which would strand an already-created order. */
export const MIN_PAYABLE_CENTS = 200;

export function toCents(amount: number | string | { toString(): string }) {
  return Math.round(Number(amount) * 100);
}

export function fromCents(cents: number) {
  return cents / 100;
}

export type CouponRules = {
  type: "percentage" | "fixed_amount";
  /** percentage: 0–100. fixed_amount: RON. */
  value: number;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  maxRedemptionsTotal: number | null;
  maxRedemptionsPerUser: number | null;
  firstOrderOnly: boolean;
  isActive: boolean;
  redemptionCount: number;
};

export type CouponContext = {
  subtotalCents: number;
  now: Date;
  /** How many times THIS user already redeemed this coupon. */
  userRedemptionCount: number;
  /** Whether the user has any earlier paid order (cancelled/unpaid ones don't count). */
  hasPriorPaidOrder: boolean;
};

export type CouponFailure =
  | "inactive"
  | "not_started"
  | "expired"
  | "min_order"
  | "limit_reached"
  | "user_limit_reached"
  | "first_order_only"
  | "no_effect";

/** User-facing copy. `inactive` is deliberately generic so a disabled code is indistinguishable
 * from one that never existed (callers use the same message for "not found"). */
export const COUPON_FAILURE_MESSAGE: Record<CouponFailure, string> = {
  inactive: "This code isn't valid.",
  not_started: "This code isn't active yet.",
  expired: "This code has expired.",
  min_order: "Your order doesn't reach the minimum amount for this code.",
  limit_reached: "This code has reached its usage limit.",
  user_limit_reached: "You've already used this code.",
  first_order_only: "This code is only valid on your first order.",
  no_effect: "This code can't be applied to an order this small.",
};

export const COUPON_NOT_FOUND_MESSAGE = COUPON_FAILURE_MESSAGE.inactive;

export function normalizeCouponCode(raw: string) {
  return raw.trim().toUpperCase();
}

/** Discount in cents for a cart subtotal, ignoring eligibility (see evaluateCoupon). Capped by the
 * code's own max, and so the payable total never drops below MIN_PAYABLE_CENTS. */
export function computeDiscountCents(rules: Pick<CouponRules, "type" | "value" | "maxDiscountAmount">, subtotalCents: number) {
  let discount =
    rules.type === "percentage" ? Math.round((subtotalCents * rules.value) / 100) : toCents(rules.value);
  if (rules.maxDiscountAmount !== null) discount = Math.min(discount, toCents(rules.maxDiscountAmount));
  discount = Math.min(discount, subtotalCents - MIN_PAYABLE_CENTS);
  return Math.max(discount, 0);
}

export type CouponEvaluation = { ok: true; discountCents: number } | { ok: false; reason: CouponFailure };

export function evaluateCoupon(rules: CouponRules, ctx: CouponContext): CouponEvaluation {
  if (!rules.isActive) return { ok: false, reason: "inactive" };
  if (rules.startsAt && ctx.now < rules.startsAt) return { ok: false, reason: "not_started" };
  if (rules.expiresAt && ctx.now > rules.expiresAt) return { ok: false, reason: "expired" };
  if (rules.minOrderAmount !== null && ctx.subtotalCents < toCents(rules.minOrderAmount)) {
    return { ok: false, reason: "min_order" };
  }
  if (rules.maxRedemptionsTotal !== null && rules.redemptionCount >= rules.maxRedemptionsTotal) {
    return { ok: false, reason: "limit_reached" };
  }
  if (rules.maxRedemptionsPerUser !== null && ctx.userRedemptionCount >= rules.maxRedemptionsPerUser) {
    return { ok: false, reason: "user_limit_reached" };
  }
  if (rules.firstOrderOnly && ctx.hasPriorPaidOrder) return { ok: false, reason: "first_order_only" };

  const discountCents = computeDiscountCents(rules, ctx.subtotalCents);
  if (discountCents <= 0) return { ok: false, reason: "no_effect" };
  return { ok: true, discountCents };
}

/**
 * Splits a discount across sub-orders pro rata to their subtotals using largest-remainder
 * rounding, so the allocated cents sum EXACTLY to the discount (naive per-item rounding can be a
 * cent over or under, which would make the sum of per-sub-order refunds disagree with what the
 * buyer was charged). Ties break toward the earlier sub-order, so the result is deterministic.
 */
export function allocateDiscountCents(discountCents: number, subtotalsCents: number[]): number[] {
  const total = subtotalsCents.reduce((a, b) => a + b, 0);
  if (total <= 0 || discountCents <= 0) return subtotalsCents.map(() => 0);

  const exact = subtotalsCents.map((s) => (discountCents * s) / total);
  const floors = exact.map(Math.floor);
  let remaining = discountCents - floors.reduce((a, b) => a + b, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    floors[index] += 1;
    remaining -= 1;
  }
  return floors;
}
