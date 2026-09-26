import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { deleteOwnAccount } from "@/server/services/account-service";
import { createApprovedSeller, createBuyer, createCategory, createActiveProduct, placeOrder } from "@test/helpers";

describe("deleteOwnAccount", () => {
  it("scrubs PII and bumps sessionVersion", async () => {
    const buyer = await createBuyer();

    const result = await deleteOwnAccount(buyer.id);

    expect(result.ok).toBe(true);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } });
    expect(updated.name).toBe("Deleted user");
    expect(updated.email).toBe(`deleted-${buyer.id}@anonymized.invalid`);
    expect(updated.phone).toBeNull();
    expect(updated.anonymizedAt).not.toBeNull();
    expect(updated.sessionVersion).toBe(buyer.sessionVersion + 1);
  });

  it("is idempotent on a second call", async () => {
    const buyer = await createBuyer();
    await deleteOwnAccount(buyer.id);
    const afterFirst = await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } });

    const second = await deleteOwnAccount(buyer.id);

    expect(second.ok).toBe(true);
    const afterSecond = await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } });
    expect(afterSecond.sessionVersion).toBe(afterFirst.sessionVersion);
  });

  it("refuses a seller account and changes nothing", async () => {
    const { user } = await createApprovedSeller();

    const result = await deleteOwnAccount(user.id);

    expect(result.ok).toBe(false);
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.email).toBe(user.email);
    expect(unchanged.anonymizedAt).toBeNull();
  });

  it("keeps the deleted buyer's past order visible to the seller who fulfilled it", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);
    const order = await placeOrder(buyer.id, [{ productVariantId: product.variants[0].id, quantity: 1 }]);

    await deleteOwnAccount(buyer.id);

    const sellerOrders = await prisma.sellerOrder.findMany({ where: { sellerId: profile.id, orderId: order.id } });
    expect(sellerOrders).toHaveLength(1);
    const stillThereOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(stillThereOrder).not.toBeNull();
  });
});
