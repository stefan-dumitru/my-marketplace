import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { computeDailySalesRollup, yesterdayUTC } from "@/server/services/sales-rollup-service";
import { createBuyer, createApprovedSeller, createCategory, createActiveProduct, placeOrder } from "@test/helpers";

async function placeAndMarkPaid(buyerId: string, variantId: string, quantity: number, createdAt: Date) {
  const order = await placeOrder(buyerId, [{ productVariantId: variantId, quantity }]);
  await prisma.order.update({ where: { id: order.id }, data: { status: "paid", createdAt } });
  return order;
}

describe("computeDailySalesRollup", () => {
  it("aggregates paid orders for the target day into per-seller and platform-wide rows", async () => {
    const buyer = await createBuyer();
    const sellerA = await createApprovedSeller();
    const sellerB = await createApprovedSeller();
    const category = await createCategory();
    const productA = await createActiveProduct(sellerA.profile.id, category.id, { price: 20, stockQty: 10 });
    const productB = await createActiveProduct(sellerB.profile.id, category.id, { price: 15, stockQty: 10 });
    const targetDay = new Date(Date.UTC(2026, 0, 15));
    const withinDay = new Date(Date.UTC(2026, 0, 15, 12));

    await placeAndMarkPaid(buyer.id, productA.variants[0].id, 2, withinDay); // 40
    await placeAndMarkPaid(buyer.id, productB.variants[0].id, 1, withinDay); // 15
    // A different day — must not be included.
    await placeAndMarkPaid(buyer.id, productA.variants[0].id, 1, new Date(Date.UTC(2026, 0, 16, 12)));

    const summary = await computeDailySalesRollup(targetDay);

    expect(summary.sellerCount).toBe(2);
    expect(summary.orderCount).toBe(2);
    expect(summary.gmv).toBe(55);

    const rowA = await prisma.dailySellerSales.findUniqueOrThrow({
      where: { sellerId_date: { sellerId: sellerA.profile.id, date: targetDay } },
    });
    expect(rowA.orderCount).toBe(1);
    expect(Number(rowA.revenue)).toBe(40);

    const platformRow = await prisma.dailyPlatformSales.findUniqueOrThrow({ where: { date: targetDay } });
    expect(platformRow.orderCount).toBe(2);
    expect(Number(platformRow.gmv)).toBe(55);
  });

  it("excludes orders that never completed payment", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id, { stockQty: 10 });
    const targetDay = new Date(Date.UTC(2026, 0, 20));
    const order = await placeOrder(buyer.id, [{ productVariantId: product.variants[0].id, quantity: 1 }]);
    await prisma.order.update({
      where: { id: order.id },
      data: { createdAt: new Date(Date.UTC(2026, 0, 20, 12)) }, // status stays "pending_payment"
    });

    const summary = await computeDailySalesRollup(targetDay);

    expect(summary.orderCount).toBe(0);
    expect(summary.sellerCount).toBe(0);
  });

  it("is idempotent — recomputing the same day overwrites rather than double-counts", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id, { price: 30, stockQty: 10 });
    const targetDay = new Date(Date.UTC(2026, 0, 25));
    await placeAndMarkPaid(buyer.id, product.variants[0].id, 1, new Date(Date.UTC(2026, 0, 25, 9)));

    await computeDailySalesRollup(targetDay);
    const second = await computeDailySalesRollup(targetDay);

    expect(second.gmv).toBe(30);
    const count = await prisma.dailySellerSales.count({ where: { sellerId: profile.id, date: targetDay } });
    expect(count).toBe(1);
  });
});

describe("yesterdayUTC", () => {
  it("returns midnight UTC of the day before the given instant", () => {
    const now = new Date(Date.UTC(2026, 2, 10, 15, 30));

    const result = yesterdayUTC(now);

    expect(result.toISOString()).toBe("2026-03-09T00:00:00.000Z");
  });
});
