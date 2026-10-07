import { describe, expect, it, vi } from "vitest";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/webhooks/stripe/route";
import { syncSubscriptionFromStripe } from "@/server/services/subscription-service";
import {
  createActiveProduct,
  createAdmin,
  createApprovedSeller,
  createBuyer,
  createCategory,
  placeOrder,
} from "@test/helpers";

vi.mock("@/lib/stripe", () => ({ stripe: { webhooks: { constructEvent: vi.fn() } } }));
vi.mock("@/server/services/subscription-service", () => ({
  syncSubscriptionFromStripe: vi.fn(async () => {}),
  handleSubscriptionPaymentFailed: vi.fn(async () => {}),
}));

const constructEvent = vi.mocked(stripe.webhooks.constructEvent);

function deliver(type: string, object: Record<string, unknown>, { signed = true } = {}) {
  constructEvent.mockReturnValue({ id: "evt_test_1", type, data: { object } } as never);
  return POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
      headers: signed ? { "stripe-signature": "t=1,v1=abc" } : {},
    })
  );
}

async function pendingOrder() {
  const seller = await createApprovedSeller();
  const buyer = await createBuyer();
  const category = await createCategory();
  const product = await createActiveProduct(seller.profile.id, category.id);
  const order = await placeOrder(buyer.id, [{ productVariantId: product.variants[0].id, quantity: 1 }]);
  return { seller, buyer, order };
}

describe("Stripe webhook", () => {
  it("rejects a request without a signature header", async () => {
    const res = await deliver("checkout.session.completed", {}, { signed: false });
    expect(res.status).toBe(400);
  });

  it("rejects a request whose signature does not verify, and changes nothing", async () => {
    const { order } = await pendingOrder();
    constructEvent.mockImplementationOnce(() => {
      throw new Error("bad signature");
    });

    const res = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
        headers: { "stripe-signature": "forged" },
      })
    );

    expect(res.status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("pending_payment");
  });

  it("confirms a paid order, audits it, and notifies buyer and seller", async () => {
    const { seller, buyer, order } = await pendingOrder();

    const res = await deliver("checkout.session.completed", {
      mode: "payment",
      payment_intent: "pi_123",
      metadata: { orderId: order.id },
    });

    expect(res.status).toBe(200);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe("succeeded");
    expect(payment.stripePaymentIntentId).toBe("pi_123");
    expect(payment.paidAt).not.toBeNull();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("paid");
    const sellerOrders = await prisma.sellerOrder.findMany({ where: { orderId: order.id } });
    expect(sellerOrders.every((so) => so.status === "confirmed")).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "payment_succeeded", entityId: order.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: buyer.id, type: "order_confirmed" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: seller.user.id, type: "seller_order_received" } })).toBe(1);
  });

  it("treats a redelivered event as a no-op: no second audit entry or notification", async () => {
    const { seller, buyer, order } = await pendingOrder();
    const event = { mode: "payment", payment_intent: "pi_123", metadata: { orderId: order.id } };

    await deliver("checkout.session.completed", event);
    const second = await deliver("checkout.session.completed", event);

    expect(second.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "payment_succeeded" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: buyer.id, type: "order_confirmed" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: seller.user.id, type: "seller_order_received" } })).toBe(1);
  });

  it("acknowledges a completed session that carries no order id", async () => {
    const { order } = await pendingOrder();

    const res = await deliver("checkout.session.completed", { mode: "payment", metadata: {} });

    expect(res.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("pending_payment");
  });

  it("syncs a subscription checkout from Stripe instead of treating it as an order", async () => {
    const { order } = await pendingOrder();

    const res = await deliver("checkout.session.completed", { mode: "subscription", subscription: "sub_123" });

    expect(res.status).toBe(200);
    expect(syncSubscriptionFromStripe).toHaveBeenCalledWith("sub_123");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("pending_payment");
  });

  it("marks an expired checkout as failed once and notifies the buyer", async () => {
    const { buyer, order } = await pendingOrder();
    const event = { metadata: { orderId: order.id } };

    await deliver("checkout.session.expired", event);
    await deliver("checkout.session.expired", event);

    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe("failed");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("payment_failed");
    expect(await prisma.auditLog.count({ where: { action: "payment_failed" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: buyer.id, type: "order_payment_failed" } })).toBe(1);
  });

  it("never downgrades an order that was already paid when a stale expiry event arrives", async () => {
    const { order } = await pendingOrder();
    await deliver("checkout.session.completed", { mode: "payment", payment_intent: "pi_1", metadata: { orderId: order.id } });

    await deliver("checkout.session.expired", { metadata: { orderId: order.id } });

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("paid");
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe("succeeded");
  });

  it("returns 500 and alerts the admins when handling a verified event fails", async () => {
    const admin = await createAdmin();
    vi.mocked(syncSubscriptionFromStripe).mockRejectedValueOnce(new Error("boom"));

    const res = await deliver("customer.subscription.updated", { id: "sub_123" });

    expect(res.status).toBe(500);
    expect(await prisma.notification.count({ where: { userId: admin.id, type: "webhook_failure" } })).toBe(1);
  });

  it("syncs payouts-enabled status from Connect account updates", async () => {
    const { profile } = await createApprovedSeller();
    await prisma.sellerProfile.update({ where: { id: profile.id }, data: { stripeConnectAccountId: "acct_1" } });

    await deliver("account.updated", { id: "acct_1", payouts_enabled: true });
    expect((await prisma.sellerProfile.findUniqueOrThrow({ where: { id: profile.id } })).payoutsEnabled).toBe(true);

    await deliver("account.updated", { id: "acct_1", payouts_enabled: false });
    expect((await prisma.sellerProfile.findUniqueOrThrow({ where: { id: profile.id } })).payoutsEnabled).toBe(false);
  });

  it("acknowledges event types it does not handle", async () => {
    const res = await deliver("charge.refunded", { id: "ch_1" });
    expect(res.status).toBe(200);
  });
});
