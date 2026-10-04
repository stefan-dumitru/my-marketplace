import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import * as carrierService from "@/server/services/carrier-service";
import { markShipped, markDelivered, cancelSellerOrder } from "@/server/services/seller-order-service";
import { createBuyer, createApprovedSeller, createCategory, createActiveProduct, placeOrder } from "@test/helpers";

// createOrderFromCart is the pure-DB half of checkout — it never talks to Stripe, so a fresh
// SellerOrder starts "pending" until the payment webhook confirms it (see order-service.ts).
// That confirmation step is out of scope here (no Stripe calls in this suite), so the fixture
// bumps status to "confirmed" directly, standing in for "payment already succeeded."
async function placeOrderAndGetSellerOrder(buyerId: string, sellerId: string, categoryId: string) {
  const product = await createActiveProduct(sellerId, categoryId, { stockQty: 10 });
  const order = await placeOrder(buyerId, [{ productVariantId: product.variants[0].id, quantity: 1 }]);
  const sellerOrder = await prisma.sellerOrder.update({
    where: { id: (await prisma.sellerOrder.findFirstOrThrow({ where: { orderId: order.id, sellerId } })).id },
    data: { status: "confirmed" },
  });
  return { product, order, sellerOrder };
}

// FAN Courier lookups are mocked: any number starting with "TRACK" is a known AWB.
vi.mock("@/server/services/carrier-service", () => ({
  fetchTracking: vi.fn(async (n: string) =>
    n.startsWith("TRACK")
      ? { ok: true as const, status: "REGISTERED", lastUpdate: new Date(), events: [] }
      : { ok: false as const, error: "not found" }
  ),
}));

describe("markShipped carrier verification", () => {
  it("rejects a tracking number FAN Courier doesn't know and leaves the order confirmed", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const admin = await createBuyer();
    const { sellerOrder } = await placeOrderAndGetSellerOrder(buyer.id, profile.id, category.id);

    const result = await markShipped(profile.id, sellerOrder.id, { trackingNumber: "NOPE999" }, admin.id);

    expect(result.ok).toBe(false);
    const after = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrder.id } });
    expect(after.status).toBe("confirmed");
  });

  it("trusts the number from a label generated here without a carrier lookup", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const admin = await createBuyer();
    const { sellerOrder } = await placeOrderAndGetSellerOrder(buyer.id, profile.id, category.id);
    await prisma.sellerOrder.update({
      where: { id: sellerOrder.id },
      data: { trackingNumber: "9999", labelUrl: `/api/seller/orders/${sellerOrder.id}/label` },
    });
    vi.mocked(carrierService.fetchTracking).mockClear();

    const result = await markShipped(profile.id, sellerOrder.id, { trackingNumber: "9999" }, admin.id);

    expect(result.ok).toBe(true);
    expect(carrierService.fetchTracking).not.toHaveBeenCalled();
  });
});

describe("markShipped -> markDelivered", () => {
  it("ships a confirmed order then delivers it, sending the buyer a notification", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const admin = await createBuyer();
    const { sellerOrder } = await placeOrderAndGetSellerOrder(buyer.id, profile.id, category.id);
    expect(sellerOrder.status).toBe("confirmed");

    const shipResult = await markShipped(profile.id, sellerOrder.id, { trackingNumber: "TRACK123" }, admin.id);
    expect(shipResult.ok).toBe(true);
    const afterShip = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrder.id } });
    expect(afterShip.status).toBe("shipped");

    const deliverResult = await markDelivered(profile.id, sellerOrder.id, admin.id);
    expect(deliverResult.ok).toBe(true);
    const afterDeliver = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrder.id } });
    expect(afterDeliver.status).toBe("delivered");

    const notification = await prisma.notification.findFirst({
      where: { userId: buyer.id, type: "order_delivered" },
    });
    expect(notification).not.toBeNull();
  });

  it("rejects skipping straight from confirmed to delivered", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const admin = await createBuyer();
    const { sellerOrder } = await placeOrderAndGetSellerOrder(buyer.id, profile.id, category.id);

    const result = await markDelivered(profile.id, sellerOrder.id, admin.id);

    expect(result.ok).toBe(false);
    const unchanged = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrder.id } });
    expect(unchanged.status).toBe("confirmed");
  });

  it("rejects further transitions once an order is in a terminal state", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const admin = await createBuyer();
    const { sellerOrder } = await placeOrderAndGetSellerOrder(buyer.id, profile.id, category.id);
    await markShipped(profile.id, sellerOrder.id, { trackingNumber: "TRACK123" }, admin.id);
    await markDelivered(profile.id, sellerOrder.id, admin.id);

    const result = await markShipped(profile.id, sellerOrder.id, { trackingNumber: "TRACK456" }, admin.id);

    expect(result.ok).toBe(false);
  });

  it("blocks a non-owning seller from shipping another seller's order", async () => {
    const buyer = await createBuyer();
    const { profile: owner } = await createApprovedSeller();
    const { profile: intruder } = await createApprovedSeller();
    const category = await createCategory();
    const admin = await createBuyer();
    const { sellerOrder } = await placeOrderAndGetSellerOrder(buyer.id, owner.id, category.id);

    const result = await markShipped(intruder.id, sellerOrder.id, { trackingNumber: "TRACK123" }, admin.id);

    expect(result.ok).toBe(false);
    const unchanged = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrder.id } });
    expect(unchanged.status).toBe("confirmed");
  });
});

describe("cancelSellerOrder", () => {
  it("cancels a confirmed order and restocks the product", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const admin = await createBuyer();
    const { product, sellerOrder } = await placeOrderAndGetSellerOrder(buyer.id, profile.id, category.id);
    const stockAfterOrder = await prisma.productVariant.findUniqueOrThrow({ where: { id: product.variants[0].id } });
    expect(stockAfterOrder.stockQty).toBe(9); // 10 - 1 reserved by the order

    await cancelSellerOrder(profile.id, sellerOrder.id, admin.id);

    const cancelled = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrder.id } });
    expect(cancelled.status).toBe("cancelled");
    const restocked = await prisma.productVariant.findUniqueOrThrow({ where: { id: product.variants[0].id } });
    expect(restocked.stockQty).toBe(10);
  });
});
