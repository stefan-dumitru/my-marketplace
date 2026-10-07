import { describe, expect, it, vi } from "vitest";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { releaseSellerPayouts } from "@/server/services/payout-service";
import {
  createActiveProduct,
  createApprovedSeller,
  createBuyer,
  createCategory,
  placeOrder,
} from "@test/helpers";

vi.mock("@/lib/stripe", () => ({ stripe: { transfers: { create: vi.fn(async () => ({ id: "tr_test_1" })) } } }));

const transfersCreate = vi.mocked(stripe.transfers.create);
const DAY = 24 * 60 * 60 * 1000;

async function payoutSeller(connectId: string | null = "acct_ok", payoutsEnabled = true) {
  const seller = await createApprovedSeller({ payoutsEnabled });
  if (connectId) {
    await prisma.sellerProfile.update({ where: { id: seller.profile.id }, data: { stripeConnectAccountId: connectId } });
  }
  return seller;
}

async function sellerOrderFor(
  sellerId: string,
  overrides: { status?: "delivered" | "shipped"; deliveredDaysAgo?: number; payoutAmount?: number; payoutAt?: Date } = {}
) {
  const buyer = await createBuyer();
  const category = await createCategory();
  const product = await createActiveProduct(sellerId, category.id);
  const order = await placeOrder(buyer.id, [{ productVariantId: product.variants[0].id, quantity: 1 }]);
  const sellerOrder = await prisma.sellerOrder.findFirstOrThrow({ where: { orderId: order.id } });
  return prisma.sellerOrder.update({
    where: { id: sellerOrder.id },
    data: {
      status: overrides.status ?? "delivered",
      deliveredAt: new Date(Date.now() - (overrides.deliveredDaysAgo ?? 20) * DAY),
      payoutAmount: overrides.payoutAmount ?? 90,
      payoutAt: overrides.payoutAt ?? null,
    },
  });
}

describe("releaseSellerPayouts", () => {
  it("pays a seller once for all eligible orders, in bani, and records it", async () => {
    const seller = await payoutSeller("acct_ok");
    const a = await sellerOrderFor(seller.profile.id, { payoutAmount: 90 });
    const b = await sellerOrderFor(seller.profile.id, { payoutAmount: 60.5 });

    const summary = await releaseSellerPayouts();

    expect(summary).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(transfersCreate).toHaveBeenCalledTimes(1);
    const [params, options] = transfersCreate.mock.calls[0] as [
      { amount: number; currency: string; destination: string },
      { idempotencyKey: string },
    ];
    expect(params).toEqual({ amount: 15050, currency: "ron", destination: "acct_ok" });
    const payout = await prisma.payout.findFirstOrThrow({ where: { sellerId: seller.profile.id } });
    expect(options.idempotencyKey).toBe(`payout_batch_${payout.id}`);
    expect(payout.status).toBe("paid");
    expect(payout.stripeTransferId).toBe("tr_test_1");
    expect(Number(payout.amount)).toBe(150.5);
    for (const id of [a.id, b.id]) {
      expect((await prisma.sellerOrder.findUniqueOrThrow({ where: { id } })).payoutAt).not.toBeNull();
    }
    expect(await prisma.auditLog.count({ where: { action: "payout_released", entityId: payout.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: seller.user.id, type: "payout_processed" } })).toBe(1);
  });

  it("holds back orders delivered less than 14 days ago", async () => {
    const seller = await payoutSeller();
    await sellerOrderFor(seller.profile.id, { deliveredDaysAgo: 13 });

    const summary = await releaseSellerPayouts();

    expect(summary.processed).toBe(0);
    expect(transfersCreate).not.toHaveBeenCalled();
  });

  it("ignores undelivered orders, zero-payout orders and orders already paid out", async () => {
    const seller = await payoutSeller();
    await sellerOrderFor(seller.profile.id, { status: "shipped" });
    await sellerOrderFor(seller.profile.id, { payoutAmount: 0 });
    await sellerOrderFor(seller.profile.id, { payoutAt: new Date() });

    const summary = await releaseSellerPayouts();

    expect(summary.processed).toBe(0);
    expect(transfersCreate).not.toHaveBeenCalled();
  });

  it("does not pay a seller whose payouts are not enabled", async () => {
    const seller = await payoutSeller("acct_pending", false);
    await sellerOrderFor(seller.profile.id);

    const summary = await releaseSellerPayouts();

    expect(summary.processed).toBe(0);
    expect(transfersCreate).not.toHaveBeenCalled();
  });

  it("records a failed payout, leaves orders unpaid and audits it when there is no Stripe account", async () => {
    const seller = await payoutSeller(null);
    const order = await sellerOrderFor(seller.profile.id);

    const summary = await releaseSellerPayouts();

    expect(summary).toEqual({ processed: 1, succeeded: 0, failed: 1 });
    expect(transfersCreate).not.toHaveBeenCalled();
    const payout = await prisma.payout.findFirstOrThrow({ where: { sellerId: seller.profile.id } });
    expect(payout.status).toBe("failed");
    expect((await prisma.sellerOrder.findUniqueOrThrow({ where: { id: order.id } })).payoutAt).toBeNull();
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "payout_failed", entityId: payout.id } });
    expect(log.afterValue).toMatchObject({ reason: "no_stripe_account" });
  });

  it("lets one seller's Stripe failure through without blocking the others, and retries it next run", async () => {
    const good = await payoutSeller("acct_good");
    const bad = await payoutSeller("acct_bad");
    const goodOrder = await sellerOrderFor(good.profile.id);
    const badOrder = await sellerOrderFor(bad.profile.id);
    transfersCreate.mockImplementation((async (params: { destination: string }) => {
      if (params.destination === "acct_bad") throw new Error("stripe down");
      return { id: "tr_ok" };
    }) as never);

    const first = await releaseSellerPayouts();

    expect(first).toEqual({ processed: 2, succeeded: 1, failed: 1 });
    expect((await prisma.sellerOrder.findUniqueOrThrow({ where: { id: goodOrder.id } })).payoutAt).not.toBeNull();
    expect((await prisma.sellerOrder.findUniqueOrThrow({ where: { id: badOrder.id } })).payoutAt).toBeNull();
    const failedAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: "payout_failed" } });
    expect(failedAudit.afterValue).toMatchObject({ reason: "stripe_transfer_failed" });

    transfersCreate.mockImplementation((async () => ({ id: "tr_retry" })) as never);
    const second = await releaseSellerPayouts();

    expect(second).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect((await prisma.sellerOrder.findUniqueOrThrow({ where: { id: badOrder.id } })).payoutAt).not.toBeNull();
  });

  it("never pays the same orders twice across runs", async () => {
    const seller = await payoutSeller();
    await sellerOrderFor(seller.profile.id);
    transfersCreate.mockImplementation((async () => ({ id: "tr_once" })) as never);

    await releaseSellerPayouts();
    const second = await releaseSellerPayouts();

    expect(second.processed).toBe(0);
    expect(transfersCreate).toHaveBeenCalledTimes(1);
  });
});
