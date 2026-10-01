import { describe, expect, it } from "vitest";
import {
  MIN_PAYABLE_CENTS,
  allocateDiscountCents,
  computeDiscountCents,
  evaluateCoupon,
  normalizeCouponCode,
  type CouponContext,
  type CouponRules,
} from "@/lib/coupons";

const baseRules: CouponRules = {
  type: "percentage",
  value: 10,
  minOrderAmount: null,
  maxDiscountAmount: null,
  startsAt: null,
  expiresAt: null,
  maxRedemptionsTotal: null,
  maxRedemptionsPerUser: null,
  firstOrderOnly: false,
  isActive: true,
  redemptionCount: 0,
};

const baseCtx: CouponContext = {
  subtotalCents: 10_000,
  now: new Date("2026-06-15T12:00:00Z"),
  userRedemptionCount: 0,
  hasPriorPaidOrder: false,
};

describe("computeDiscountCents", () => {
  it("computes a percentage of the subtotal", () => {
    expect(computeDiscountCents(baseRules, 10_000)).toBe(1_000);
  });

  it("computes a fixed amount in cents", () => {
    expect(computeDiscountCents({ ...baseRules, type: "fixed_amount", value: 25.5 }, 10_000)).toBe(2_550);
  });

  it("caps a percentage code at its max discount", () => {
    expect(computeDiscountCents({ ...baseRules, value: 50, maxDiscountAmount: 20 }, 10_000)).toBe(2_000);
  });

  it("never lets the payable total drop below the minimum charge", () => {
    expect(computeDiscountCents({ ...baseRules, type: "fixed_amount", value: 500 }, 10_000)).toBe(10_000 - MIN_PAYABLE_CENTS);
    expect(computeDiscountCents({ ...baseRules, value: 100 }, 10_000)).toBe(10_000 - MIN_PAYABLE_CENTS);
  });

  it("gives no discount when the subtotal is already at or below the minimum charge", () => {
    expect(computeDiscountCents(baseRules, MIN_PAYABLE_CENTS)).toBe(0);
    expect(computeDiscountCents(baseRules, 50)).toBe(0);
  });

  it("rounds a fractional percentage to the nearest cent", () => {
    expect(computeDiscountCents({ ...baseRules, value: 15 }, 3_333)).toBe(500); // 499.95 -> 500
  });
});

describe("evaluateCoupon", () => {
  it("accepts a valid coupon and returns the discount", () => {
    expect(evaluateCoupon(baseRules, baseCtx)).toEqual({ ok: true, discountCents: 1_000 });
  });

  it("rejects an inactive coupon", () => {
    expect(evaluateCoupon({ ...baseRules, isActive: false }, baseCtx)).toEqual({ ok: false, reason: "inactive" });
  });

  it("rejects before the start date and after the expiry", () => {
    const early = evaluateCoupon({ ...baseRules, startsAt: new Date("2026-07-01T00:00:00Z") }, baseCtx);
    const late = evaluateCoupon({ ...baseRules, expiresAt: new Date("2026-06-01T00:00:00Z") }, baseCtx);
    expect(early).toEqual({ ok: false, reason: "not_started" });
    expect(late).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects below the minimum order amount, accepts exactly at it", () => {
    const rules = { ...baseRules, minOrderAmount: 100 };
    expect(evaluateCoupon(rules, { ...baseCtx, subtotalCents: 9_999 })).toEqual({ ok: false, reason: "min_order" });
    expect(evaluateCoupon(rules, { ...baseCtx, subtotalCents: 10_000 }).ok).toBe(true);
  });

  it("rejects once the total redemption limit is reached", () => {
    const rules = { ...baseRules, maxRedemptionsTotal: 5, redemptionCount: 5 };
    expect(evaluateCoupon(rules, baseCtx)).toEqual({ ok: false, reason: "limit_reached" });
  });

  it("rejects once the per-user limit is reached", () => {
    const rules = { ...baseRules, maxRedemptionsPerUser: 1 };
    expect(evaluateCoupon(rules, { ...baseCtx, userRedemptionCount: 1 })).toEqual({ ok: false, reason: "user_limit_reached" });
  });

  it("rejects a first-order-only code for a returning buyer", () => {
    const rules = { ...baseRules, firstOrderOnly: true };
    expect(evaluateCoupon(rules, { ...baseCtx, hasPriorPaidOrder: true })).toEqual({ ok: false, reason: "first_order_only" });
    expect(evaluateCoupon(rules, baseCtx).ok).toBe(true);
  });

  it("rejects when the order is too small for any discount to apply", () => {
    expect(evaluateCoupon(baseRules, { ...baseCtx, subtotalCents: MIN_PAYABLE_CENTS })).toEqual({ ok: false, reason: "no_effect" });
  });
});

describe("allocateDiscountCents", () => {
  it("splits pro rata and always sums exactly to the discount", () => {
    expect(allocateDiscountCents(100, [3_333, 3_333, 3_334])).toEqual([33, 33, 34]);
  });

  it("hands leftover cents to the largest remainders, ties to the earlier sub-order", () => {
    // 1 cent over three equal sub-orders: the first one gets it.
    expect(allocateDiscountCents(1, [1_000, 1_000, 1_000])).toEqual([1, 0, 0]);
    expect(allocateDiscountCents(2, [1_000, 1_000, 1_000])).toEqual([1, 1, 0]);
  });

  it("allocates everything to a single sub-order", () => {
    expect(allocateDiscountCents(777, [5_000])).toEqual([777]);
  });

  it("returns zeros for no discount or empty subtotals", () => {
    expect(allocateDiscountCents(0, [100, 200])).toEqual([0, 0]);
    expect(allocateDiscountCents(50, [0, 0])).toEqual([0, 0]);
  });

  it("never drifts from the total across many random splits", () => {
    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 500; i++) {
      const parts = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => 200 + Math.floor(rand() * 50_000));
      const total = parts.reduce((a, b) => a + b, 0);
      const discount = Math.floor(rand() * (total - MIN_PAYABLE_CENTS));
      const allocated = allocateDiscountCents(discount, parts);
      expect(allocated.reduce((a, b) => a + b, 0)).toBe(discount);
      allocated.forEach((cents, idx) => {
        expect(cents).toBeGreaterThanOrEqual(0);
        expect(cents).toBeLessThanOrEqual(parts[idx]);
      });
    }
  });
});

describe("normalizeCouponCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeCouponCode("  summer10 ")).toBe("SUMMER10");
  });
});
