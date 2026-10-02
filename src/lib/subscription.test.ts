import { describe, expect, it } from "vitest";
import { isDead, isEntitled, shouldReplaceStored } from "@/lib/subscription";

const NOW = new Date("2026-06-15T12:00:00Z");
const future = new Date("2026-07-15T12:00:00Z");
const past = new Date("2026-06-01T12:00:00Z");

describe("isEntitled", () => {
  it("grants the benefit for active and trialing subscriptions inside their paid period", () => {
    expect(isEntitled({ status: "active", currentPeriodEnd: future }, NOW)).toBe(true);
    expect(isEntitled({ status: "trialing", currentPeriodEnd: future }, NOW)).toBe(true);
  });

  it("denies it for every other status, even with time left in the period", () => {
    for (const status of ["past_due", "unpaid", "incomplete", "incomplete_expired", "canceled", "paused"]) {
      expect(isEntitled({ status, currentPeriodEnd: future }, NOW)).toBe(false);
    }
  });

  it("denies it once the paid period has ended, even if the status still says active", () => {
    expect(isEntitled({ status: "active", currentPeriodEnd: past }, NOW)).toBe(false);
    expect(isEntitled({ status: "active", currentPeriodEnd: NOW }, NOW)).toBe(false);
  });

  it("denies it when there is no subscription", () => {
    expect(isEntitled(null, NOW)).toBe(false);
    expect(isEntitled(undefined, NOW)).toBe(false);
  });
});

describe("isDead", () => {
  it("treats only terminal statuses as dead", () => {
    expect(isDead("canceled")).toBe(true);
    expect(isDead("incomplete_expired")).toBe(true);
    expect(isDead("past_due")).toBe(false);
    expect(isDead("active")).toBe(false);
  });
});

describe("shouldReplaceStored", () => {
  const stored = (id: string, status: string) => ({ stripeSubscriptionId: id, status });

  it("always accepts the first subscription and updates to the same subscription", () => {
    expect(shouldReplaceStored(null, stored("sub_a", "active"))).toBe(true);
    expect(shouldReplaceStored(stored("sub_a", "active"), stored("sub_a", "canceled"))).toBe(true);
  });

  it("ignores a late event for an old, dead subscription while a newer one is live", () => {
    expect(shouldReplaceStored(stored("sub_new", "active"), stored("sub_old", "canceled"))).toBe(false);
  });

  it("lets a new live subscription take over from a finished one", () => {
    expect(shouldReplaceStored(stored("sub_old", "canceled"), stored("sub_new", "active"))).toBe(true);
  });

  it("lets a different subscription take over a live one only if it is live too", () => {
    expect(shouldReplaceStored(stored("sub_a", "past_due"), stored("sub_b", "active"))).toBe(true);
  });
});
