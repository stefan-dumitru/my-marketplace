import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest";
import { createOrderFromCart } from "@/server/data/orders";
import { createBuyer, createApprovedSeller, createCategory, createActiveProduct } from "@test/helpers";

const ADDRESS_SNAPSHOT = {
  recipientName: "Test Buyer",
  line1: "Str. Exemplu 1",
  line2: "",
  city: "București",
  county: "București",
  postalCode: "010101",
  country: "România",
  phone: "0700000000",
};

describe("createOrderFromCart", () => {
  it("rejects an empty cart", async () => {
    const buyer = await createBuyer();

    const result = await createOrderFromCart({
      buyerId: buyer.id,
      items: [],
      shippingAddressSnapshot: ADDRESS_SNAPSHOT,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty_cart");
  });

  it("creates one Order with one SellerOrder per seller and correct per-seller subtotals", async () => {
    const buyer = await createBuyer();
    const sellerA = await createApprovedSeller();
    const sellerB = await createApprovedSeller();
    const category = await createCategory();
    const productA = await createActiveProduct(sellerA.profile.id, category.id, { price: 20, stockQty: 10 });
    const productB = await createActiveProduct(sellerB.profile.id, category.id, { price: 15, stockQty: 10 });

    const result = await createOrderFromCart({
      buyerId: buyer.id,
      items: [
        { productVariantId: productA.variants[0].id, quantity: 2 },
        { productVariantId: productB.variants[0].id, quantity: 3 },
      ],
      shippingAddressSnapshot: ADDRESS_SNAPSHOT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.sellerOrders).toHaveLength(2);
    const soA = result.order.sellerOrders.find((so) => so.sellerId === sellerA.profile.id)!;
    const soB = result.order.sellerOrders.find((so) => so.sellerId === sellerB.profile.id)!;
    expect(Number(soA.subtotal)).toBe(40);
    expect(Number(soB.subtotal)).toBe(45);
    // Goods 85 + one flat 15 RON shipping fee per seller sub-order (2 sellers).
    expect(Number(result.order.shippingAmount)).toBe(30);
    expect(Number(result.order.totalAmount)).toBe(115);
    expect(Number(soA.shippingFee)).toBe(15);
    expect(Number(soA.shippingCharged)).toBe(15);
    // The seller keeps the whole shipping fee on top of goods minus commission (10% of 40 = 4).
    expect(Number(soA.payoutAmount)).toBeCloseTo(40 - 4 + 15, 2);
    expect(Number(soB.payoutAmount)).toBeCloseTo(45 - 4.5 + 15, 2);

    const orderCount = await prisma.order.count({ where: { buyerId: buyer.id } });
    expect(orderCount).toBe(1);
  });

  it("aborts the whole checkout when one line is out of stock (all-or-nothing)", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const inStock = await createActiveProduct(profile.id, category.id, { stockQty: 10 });
    const lowStock = await createActiveProduct(profile.id, category.id, { stockQty: 1 });

    const result = await createOrderFromCart({
      buyerId: buyer.id,
      items: [
        { productVariantId: inStock.variants[0].id, quantity: 1 },
        { productVariantId: lowStock.variants[0].id, quantity: 5 },
      ],
      shippingAddressSnapshot: ADDRESS_SNAPSHOT,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("insufficient_stock");
    const orderCount = await prisma.order.count({ where: { buyerId: buyer.id } });
    expect(orderCount).toBe(0);
    const reloaded = await prisma.productVariant.findUniqueOrThrow({ where: { id: inStock.variants[0].id } });
    expect(reloaded.stockQty).toBe(10); // the in-stock line's decrement was rolled back too
  });

  it("aborts the whole checkout when a line's product is no longer active", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const inactive = await createActiveProduct(profile.id, category.id, { status: "inactive" });

    const result = await createOrderFromCart({
      buyerId: buyer.id,
      items: [{ productVariantId: inactive.variants[0].id, quantity: 1 }],
      shippingAddressSnapshot: ADDRESS_SNAPSHOT,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("product_unavailable");
  });

  it("never oversells the last unit under concurrent checkout", async () => {
    const buyerX = await createBuyer();
    const buyerY = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id, { stockQty: 1 });

    const [resultX, resultY] = await Promise.all([
      createOrderFromCart({
        buyerId: buyerX.id,
        items: [{ productVariantId: product.variants[0].id, quantity: 1 }],
        shippingAddressSnapshot: ADDRESS_SNAPSHOT,
      }),
      createOrderFromCart({
        buyerId: buyerY.id,
        items: [{ productVariantId: product.variants[0].id, quantity: 1 }],
        shippingAddressSnapshot: ADDRESS_SNAPSHOT,
      }),
    ]);

    const outcomes = [resultX, resultY];
    const succeeded = outcomes.filter((r) => r.ok);
    const failed = outcomes.filter((r) => !r.ok);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    const reloaded = await prisma.productVariant.findUniqueOrThrow({ where: { id: product.variants[0].id } });
    expect(reloaded.stockQty).toBe(0);
  });

  it("fires a low-stock alert exactly once when stock first dips to/under the threshold", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id, { stockQty: 6 }); // threshold is 5

    await createOrderFromCart({
      buyerId: buyer.id,
      items: [{ productVariantId: product.variants[0].id, quantity: 2 }], // 6 -> 4, crosses the threshold
      shippingAddressSnapshot: ADDRESS_SNAPSHOT,
    });

    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(inngest.send).toHaveBeenCalledWith({
      name: "product/stock-low",
      data: { sellerId: profile.id, productId: product.id, productName: product.name, remaining: 4 },
    });
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: product.variants[0].id } });
    expect(variant.lowStockAlertedAt).not.toBeNull();

    // A second sale while still low must not re-fire the alert.
    await createOrderFromCart({
      buyerId: buyer.id,
      items: [{ productVariantId: product.variants[0].id, quantity: 1 }], // 4 -> 3, still low
      shippingAddressSnapshot: ADDRESS_SNAPSHOT,
    });
    expect(inngest.send).toHaveBeenCalledTimes(1);
  });

  it("does not fire a low-stock alert while stock stays comfortably above the threshold", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id, { stockQty: 20 });

    await createOrderFromCart({
      buyerId: buyer.id,
      items: [{ productVariantId: product.variants[0].id, quantity: 1 }], // 20 -> 19
      shippingAddressSnapshot: ADDRESS_SNAPSHOT,
    });

    expect(inngest.send).not.toHaveBeenCalled();
  });
});
