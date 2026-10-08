import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
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

// What generating a FAN Courier label does to the order: stores the AWB together with the label route.
async function withLabel(sellerOrderId: string, awb: string) {
  return prisma.sellerOrder.update({
    where: { id: sellerOrderId },
    data: { trackingNumber: awb, labelUrl: `/api/seller/orders/${sellerOrderId}/label` },
  });
}

describe("markShipped only ships with the label's tracking number", () => {
  it("refuses an order that has no label yet, with a message that says what to do", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const admin = await createBuyer();
    const { sellerOrder } = await placeOrderAndGetSellerOrder(buyer.id, profile.id, category.id);

    const result = await markShipped(profile.id, sellerOrder.id, admin.id);

    expect(result).toMatchObject({ ok: false, formError: expect.stringContaining("Generate the shipping label first") });
    const after = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrder.id } });
    expect(after.status).toBe("confirmed");
    expect(after.shippedAt).toBeNull();
  });

  it("refuses a hand-typed legacy number that has no label behind it", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const admin = await createBuyer();
    const { sellerOrder } = await placeOrderAndGetSellerOrder(buyer.id, profile.id, category.id);
    await prisma.sellerOrder.update({ where: { id: sellerOrder.id }, data: { trackingNumber: "TYPED-BY-HAND" } });

    const result = await markShipped(profile.id, sellerOrder.id, admin.id);

    expect(result.ok).toBe(false);
    expect((await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrder.id } })).status).toBe("confirmed");
  });

  it("ships with the label's number, keeps it unchanged, audits it and tells the buyer", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const admin = await createBuyer();
    const { sellerOrder } = await placeOrderAndGetSellerOrder(buyer.id, profile.id, category.id);
    await withLabel(sellerOrder.id, "2228300120233");

    const result = await markShipped(profile.id, sellerOrder.id, admin.id);

    expect(result.ok).toBe(true);
    const after = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrder.id } });
    expect(after).toMatchObject({ status: "shipped", trackingNumber: "2228300120233" });
    expect(after.shippedAt).not.toBeNull();
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "seller_order_shipped", entityId: sellerOrder.id } });
    expect(log.afterValue).toMatchObject({ status: "shipped", trackingNumber: "2228300120233" });
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: buyer.id, type: "order_shipped" } });
    expect(note.body).toContain("2228300120233");
  });
});

describe("label tracking numbers are unique", () => {
  async function twoOrders() {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const a = await placeOrderAndGetSellerOrder(buyer.id, profile.id, category.id);
    const b = await placeOrderAndGetSellerOrder(buyer.id, profile.id, category.id);
    return { a: a.sellerOrder, b: b.sellerOrder };
  }

  it("will not attach one label number to two orders", async () => {
    const { a, b } = await twoOrders();
    await withLabel(a.id, "SAME-AWB");

    await expect(withLabel(b.id, "SAME-AWB")).rejects.toMatchObject({ code: "P2002" });
    expect((await prisma.sellerOrder.findUniqueOrThrow({ where: { id: b.id } })).trackingNumber).toBeNull();
  });

  it("does not disturb older orders whose number was typed by hand", async () => {
    const { a, b } = await twoOrders();

    await prisma.sellerOrder.update({ where: { id: a.id }, data: { trackingNumber: "LEGACY-1" } });
    await expect(
      prisma.sellerOrder.update({ where: { id: b.id }, data: { trackingNumber: "LEGACY-1" } })
    ).resolves.toBeTruthy();
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

    await withLabel(sellerOrder.id, "TRACK123");
    const shipResult = await markShipped(profile.id, sellerOrder.id, admin.id);
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
    await withLabel(sellerOrder.id, "TRACK123");
    await markShipped(profile.id, sellerOrder.id, admin.id);
    await markDelivered(profile.id, sellerOrder.id, admin.id);

    const result = await markShipped(profile.id, sellerOrder.id, admin.id);

    expect(result.ok).toBe(false);
  });

  it("blocks a non-owning seller from shipping another seller's order", async () => {
    const buyer = await createBuyer();
    const { profile: owner } = await createApprovedSeller();
    const { profile: intruder } = await createApprovedSeller();
    const category = await createCategory();
    const admin = await createBuyer();
    const { sellerOrder } = await placeOrderAndGetSellerOrder(buyer.id, owner.id, category.id);

    await withLabel(sellerOrder.id, "TRACK123");
    const result = await markShipped(intruder.id, sellerOrder.id, admin.id);

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
