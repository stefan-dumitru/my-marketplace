import { afterEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { inngest } from "@/lib/inngest";
import { SHIPPING_FEE_PER_SELLER } from "@/lib/constants";
import { getCartWithItems } from "@/server/data/cart";
import { createOrderFromCart } from "@/server/data/orders";
import { deleteOwnAccount } from "@/server/services/account-service";
import { checkoutCart } from "@/server/services/order-service";
import {
  cancelSubscriptionForErasure,
  getShippingQuote,
  handleSubscriptionPaymentFailed,
  openBillingPortal,
  startSubscriptionCheckout,
  syncSubscriptionFromStripe,
} from "@/server/services/subscription-service";
import { createActiveProduct, createApprovedSeller, createBuyer, createCategory } from "@test/helpers";

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

type FakeSub = { id: string; customer: string; status: string; periodEnd: Date; cancelAtPeriodEnd?: boolean };

/** Shaped like the Stripe API's Subscription (the period lives on the item in the current API). */
function fakeSub(s: FakeSub) {
  return {
    id: s.id,
    customer: s.customer,
    status: s.status,
    cancel_at_period_end: s.cancelAtPeriodEnd ?? false,
    items: { data: [{ current_period_end: seconds(s.periodEnd) }] },
  } as unknown as Stripe.Subscription;
}

const ADDRESS = {
  recipientName: "Test Buyer",
  line1: "Str. Exemplu 1",
  line2: "",
  city: "București",
  county: "București",
  postalCode: "010101",
  phone: "0700000000",
};

async function buyerWithCustomer() {
  const buyer = await createBuyer();
  const customerId = `cus_${buyer.id}`;
  await prisma.user.update({ where: { id: buyer.id }, data: { stripeCustomerId: customerId } });
  return { buyer, customerId };
}

async function giveSubscription(userId: string, status: string, periodEnd: Date, id = `sub_${userId}`) {
  return prisma.subscription.create({ data: { userId, stripeSubscriptionId: id, status, currentPeriodEnd: periodEnd } });
}

async function product(price = 100) {
  const { profile } = await createApprovedSeller();
  const category = await createCategory();
  const p = await createActiveProduct(profile.id, category.id, { price, stockQty: 20 });
  return { sellerId: profile.id, variantId: p.variants[0].id };
}

const place = (buyerId: string, variantIds: string[]) =>
  createOrderFromCart({
    buyerId,
    items: variantIds.map((productVariantId) => ({ productVariantId, quantity: 1 })),
    shippingAddressSnapshot: ADDRESS,
  });

afterEach(() => {
  delete process.env.STRIPE_SUBSCRIPTION_PRICE_ID;
});

describe("syncSubscriptionFromStripe", () => {
  it("stores Stripe's current view of the subscription and audits the first status", async () => {
    const { buyer, customerId } = await buyerWithCustomer();
    const periodEnd = inDays(30);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValueOnce(
      fakeSub({ id: "sub_1", customer: customerId, status: "active", periodEnd, cancelAtPeriodEnd: true }) as never
    );

    const result = await syncSubscriptionFromStripe("sub_1");

    expect(result).toMatchObject({ ignored: false, userId: buyer.id, applied: true, status: "active" });
    const row = await prisma.subscription.findUniqueOrThrow({ where: { userId: buyer.id } });
    expect(row).toMatchObject({ stripeSubscriptionId: "sub_1", status: "active", cancelAtPeriodEnd: true });
    expect(Math.abs(row.currentPeriodEnd.getTime() - periodEnd.getTime())).toBeLessThan(1000);
    expect(await prisma.auditLog.count({ where: { action: "subscription_status_changed", entityId: "sub_1" } })).toBe(1);
  });

  it("is idempotent: a redelivered event neither duplicates the row nor re-audits", async () => {
    const { buyer, customerId } = await buyerWithCustomer();
    const sub = fakeSub({ id: "sub_1", customer: customerId, status: "active", periodEnd: inDays(30) });
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub as never);

    await syncSubscriptionFromStripe("sub_1");
    await syncSubscriptionFromStripe("sub_1");

    expect(await prisma.subscription.count({ where: { userId: buyer.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "subscription_status_changed" } })).toBe(1);
  });

  it("ignores a subscription whose customer we don't know", async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValueOnce(
      fakeSub({ id: "sub_x", customer: "cus_stranger", status: "active", periodEnd: inDays(30) }) as never
    );

    expect(await syncSubscriptionFromStripe("sub_x")).toEqual({ ignored: true });
    expect(await prisma.subscription.count()).toBe(0);
  });

  it("ignores a subscription with no billing period instead of storing garbage", async () => {
    const { customerId } = await buyerWithCustomer();
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValueOnce({
      id: "sub_np",
      customer: customerId,
      status: "active",
      cancel_at_period_end: false,
      items: { data: [] },
    } as never);

    expect(await syncSubscriptionFromStripe("sub_np")).toEqual({ ignored: true });
    expect(await prisma.subscription.count()).toBe(0);
  });

  it("never lets a late event for an old cancelled subscription clobber the new live one", async () => {
    const { buyer, customerId } = await buyerWithCustomer();
    await giveSubscription(buyer.id, "active", inDays(30), "sub_new");
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValueOnce(
      fakeSub({ id: "sub_old", customer: customerId, status: "canceled", periodEnd: inDays(-3) }) as never
    );

    const result = await syncSubscriptionFromStripe("sub_old");

    expect(result).toMatchObject({ ignored: false, applied: false });
    expect(await prisma.subscription.findUniqueOrThrow({ where: { userId: buyer.id } })).toMatchObject({
      stripeSubscriptionId: "sub_new",
      status: "active",
    });
  });

  it("lets a brand-new subscription replace a finished one (resubscribe)", async () => {
    const { buyer, customerId } = await buyerWithCustomer();
    await giveSubscription(buyer.id, "canceled", inDays(-10), "sub_old");
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValueOnce(
      fakeSub({ id: "sub_new", customer: customerId, status: "active", periodEnd: inDays(30) }) as never
    );

    await syncSubscriptionFromStripe("sub_new");

    expect(await prisma.subscription.findUniqueOrThrow({ where: { userId: buyer.id } })).toMatchObject({
      stripeSubscriptionId: "sub_new",
      status: "active",
    });
  });
});

describe("free shipping at checkout", () => {
  it("charges no shipping to an active subscriber but still owes the seller the full fee", async () => {
    const { buyer } = await buyerWithCustomer();
    await giveSubscription(buyer.id, "active", inDays(10));
    const nonSubscriber = await createBuyer();
    const a = await product(100);
    const b = await product(50);

    const free = await place(buyer.id, [a.variantId, b.variantId]);
    const paid = await place(nonSubscriber.id, [a.variantId, b.variantId]);
    if (!free.ok || !paid.ok) throw new Error("setup failed");

    expect(Number(free.order.shippingAmount)).toBe(0);
    expect(Number(free.order.totalAmount)).toBe(150);
    expect(Number(paid.order.totalAmount)).toBe(150 + 2 * SHIPPING_FEE_PER_SELLER);
    for (const so of free.order.sellerOrders) {
      const twin = paid.order.sellerOrders.find((p) => p.sellerId === so.sellerId)!;
      expect(Number(so.shippingFee)).toBe(SHIPPING_FEE_PER_SELLER);
      expect(Number(so.shippingCharged)).toBe(0);
      // The seller's payout is identical whether or not the buyer subscribes.
      expect(Number(so.payoutAmount)).toBeCloseTo(Number(twin.payoutAmount), 2);
    }
  });

  it.each([
    ["past_due", 10],
    ["unpaid", 10],
    ["canceled", 10],
    ["incomplete", 10],
    ["active", -1],
  ])("still charges shipping when the status is %s (period end %i days away)", async (status, days) => {
    const { buyer } = await buyerWithCustomer();
    await giveSubscription(buyer.id, status, inDays(days));
    const a = await product(100);

    const result = await place(buyer.id, [a.variantId]);
    if (!result.ok) throw new Error("setup failed");

    expect(Number(result.order.shippingAmount)).toBe(SHIPPING_FEE_PER_SELLER);
  });

  it("keeps free shipping after cancelling until the paid period actually ends", async () => {
    const { buyer } = await buyerWithCustomer();
    await prisma.subscription.create({
      data: {
        userId: buyer.id,
        stripeSubscriptionId: "sub_c",
        status: "active",
        currentPeriodEnd: inDays(5),
        cancelAtPeriodEnd: true,
      },
    });
    const a = await product(100);

    const result = await place(buyer.id, [a.variantId]);
    if (!result.ok) throw new Error("setup failed");

    expect(Number(result.order.shippingAmount)).toBe(0);
  });

  it("sends Stripe no shipping line for a subscriber and charges exactly the stored total", async () => {
    const { buyer } = await buyerWithCustomer();
    await giveSubscription(buyer.id, "active", inDays(10));
    const a = await product(100);
    const { cart } = await getCartWithItems(buyer.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, productVariantId: a.variantId, quantity: 1 } });

    expect(await checkoutCart(buyer.id, buyer.email, ADDRESS)).toMatchObject({ ok: true });

    const [params] = vi.mocked(stripe.checkout.sessions.create).mock.calls[0] as unknown as [
      { line_items: { price_data: { unit_amount: number; product_data: { name: string } }; quantity: number }[] },
    ];
    expect(params.line_items.some((li) => li.price_data.product_data.name.startsWith("Shipping"))).toBe(false);
    expect(params.line_items.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0)).toBe(10_000);
  });

  it("quotes the cart: free for a subscriber, the full fee for everyone else", async () => {
    const { buyer } = await buyerWithCustomer();
    const other = await createBuyer();
    await giveSubscription(buyer.id, "active", inDays(10));

    expect(await getShippingQuote(buyer.id, 2)).toEqual({
      feeCents: 2 * SHIPPING_FEE_PER_SELLER * 100,
      chargedCents: 0,
      waived: true,
    });
    expect(await getShippingQuote(other.id, 2)).toMatchObject({
      chargedCents: 2 * SHIPPING_FEE_PER_SELLER * 100,
      waived: false,
    });
  });
});

describe("startSubscriptionCheckout", () => {
  it("reports unavailable when the price isn't configured", async () => {
    const buyer = await createBuyer();

    expect(await startSubscriptionCheckout(buyer.id)).toMatchObject({ ok: false });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("creates the Stripe customer once, stores it, and opens a subscription-mode session", async () => {
    process.env.STRIPE_SUBSCRIPTION_PRICE_ID = "price_test";
    const buyer = await createBuyer();

    const first = await startSubscriptionCheckout(buyer.id);
    const second = await startSubscriptionCheckout(buyer.id);

    expect(first).toEqual({ ok: true, redirectUrl: "https://stripe.test/pay" });
    expect(second.ok).toBe(true);
    expect(stripe.customers.create).toHaveBeenCalledTimes(1);
    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { userId: buyer.id } }),
      { idempotencyKey: `customer_${buyer.id}` }
    );
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).stripeCustomerId).toBe("cus_test_mock");
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_test_mock",
        line_items: [{ price: "price_test", quantity: 1 }],
        subscription_data: { metadata: { userId: buyer.id } },
      })
    );
  });

  it("refuses a second subscription while one is active or needs payment attention", async () => {
    process.env.STRIPE_SUBSCRIPTION_PRICE_ID = "price_test";
    const active = await createBuyer();
    const lapsed = await createBuyer();
    await giveSubscription(active.id, "active", inDays(10));
    await giveSubscription(lapsed.id, "past_due", inDays(10));

    expect(await startSubscriptionCheckout(active.id)).toMatchObject({ ok: false });
    expect(await startSubscriptionCheckout(lapsed.id)).toMatchObject({ ok: false });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("allows subscribing again after the previous subscription ended", async () => {
    process.env.STRIPE_SUBSCRIPTION_PRICE_ID = "price_test";
    const buyer = await createBuyer();
    await giveSubscription(buyer.id, "canceled", inDays(-5));

    expect(await startSubscriptionCheckout(buyer.id)).toMatchObject({ ok: true });
  });

  it("fails cleanly when Stripe is down", async () => {
    process.env.STRIPE_SUBSCRIPTION_PRICE_ID = "price_test";
    const buyer = await createBuyer();
    vi.mocked(stripe.customers.create).mockRejectedValueOnce(new Error("network"));

    expect(await startSubscriptionCheckout(buyer.id)).toMatchObject({ ok: false });
  });
});

describe("openBillingPortal", () => {
  it("opens the portal for the signed-in user's own Stripe customer only", async () => {
    const { buyer, customerId } = await buyerWithCustomer();
    await buyerWithCustomer(); // someone else's customer must never be reachable

    expect(await openBillingPortal(buyer.id)).toEqual({ ok: true, redirectUrl: "https://stripe.test/portal" });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: customerId }));
  });

  it("refuses a user who has never subscribed", async () => {
    const buyer = await createBuyer();

    expect(await openBillingPortal(buyer.id)).toMatchObject({ ok: false });
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });
});

describe("handleSubscriptionPaymentFailed", () => {
  const invoiceFor = (customer: string) => ({ customer }) as unknown as Stripe.Invoice;
  const emailsSent = () =>
    vi.mocked(inngest.send).mock.calls.filter(([e]) => (e as { name: string }).name === "email/send.requested");

  it("emails the buyer once when they lose the benefit, not on redelivery", async () => {
    const { buyer, customerId } = await buyerWithCustomer();
    await giveSubscription(buyer.id, "active", inDays(10), "sub_f");
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({ id: "sub_f", customer: customerId, status: "past_due", periodEnd: inDays(10) }) as never
    );

    await handleSubscriptionPaymentFailed(invoiceFor(customerId));
    await handleSubscriptionPaymentFailed(invoiceFor(customerId));

    expect(await prisma.subscription.findUniqueOrThrow({ where: { userId: buyer.id } })).toMatchObject({
      status: "past_due",
    });
    expect(emailsSent()).toHaveLength(1);
    expect(emailsSent()[0][0]).toMatchObject({ data: { to: buyer.email } });
  });

  it("ignores invoices for customers or subscriptions we don't have", async () => {
    await handleSubscriptionPaymentFailed(invoiceFor("cus_nobody"));
    const { customerId } = await buyerWithCustomer();
    await handleSubscriptionPaymentFailed(invoiceFor(customerId));

    expect(emailsSent()).toHaveLength(0);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });
});

describe("account erasure with a subscription", () => {
  it("cancels the Stripe subscription first, then anonymizes", async () => {
    const buyer = await createBuyer();
    await giveSubscription(buyer.id, "active", inDays(10), "sub_gdpr");

    expect(await deleteOwnAccount(buyer.id)).toEqual({ ok: true });

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_gdpr");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).anonymizedAt).not.toBeNull();
    expect((await prisma.subscription.findUniqueOrThrow({ where: { userId: buyer.id } })).status).toBe("canceled");
  });

  it("does NOT erase the account when Stripe can't cancel the subscription", async () => {
    const buyer = await createBuyer();
    await giveSubscription(buyer.id, "active", inDays(10), "sub_gdpr");
    vi.mocked(stripe.subscriptions.cancel).mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "api_error" }));

    expect(await deleteOwnAccount(buyer.id)).toMatchObject({ ok: false });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).anonymizedAt).toBeNull();
  });

  it("treats a subscription Stripe no longer has as already cancelled", async () => {
    const buyer = await createBuyer();
    await giveSubscription(buyer.id, "active", inDays(10), "sub_gone");
    vi.mocked(stripe.subscriptions.cancel).mockRejectedValueOnce(
      Object.assign(new Error("No such subscription"), { code: "resource_missing" })
    );

    expect(await cancelSubscriptionForErasure(buyer.id)).toBe(true);
  });

  it("needs no Stripe call for a user who never subscribed", async () => {
    const buyer = await createBuyer();

    expect(await deleteOwnAccount(buyer.id)).toEqual({ ok: true });
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });
});
