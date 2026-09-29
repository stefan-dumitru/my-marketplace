import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrderFromCart } from "@/server/data/orders";
import {
  toggleWishlistItem,
  isProductWishlisted,
  getWishlistItemCount,
  listWishlistForBuyer,
  getCoPurchasedProducts,
} from "@/server/services/wishlist-service";
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

/**
 * Places a single real order covering all given variants, then marks it paid — co-purchase
 * ranking only counts paid orders, and only counts two products "bought together" when they're
 * line items of the SAME order (see listCoPurchasedProductIds's join on a shared order id).
 */
async function placePaidOrder(buyerId: string, variantIds: string[]) {
  const result = await createOrderFromCart({
    buyerId,
    items: variantIds.map((productVariantId) => ({ productVariantId, quantity: 1 })),
    shippingAddressSnapshot: ADDRESS_SNAPSHOT,
  });
  if (!result.ok) throw new Error(`placePaidOrder helper failed: ${JSON.stringify(result)}`);
  await prisma.order.update({ where: { id: result.order.id }, data: { status: "paid" } });
  return result.order;
}

describe("toggleWishlistItem", () => {
  it("adds a product to the wishlist", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);

    const result = await toggleWishlistItem(buyer.id, product.id, "add");

    expect(result.ok).toBe(true);
    expect(await isProductWishlisted(buyer.id, product.id)).toBe(true);
  });

  it("adding the same product twice is a no-op, not a duplicate row", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);

    await toggleWishlistItem(buyer.id, product.id, "add");
    await toggleWishlistItem(buyer.id, product.id, "add");

    expect(await getWishlistItemCount(buyer.id)).toBe(1);
  });

  it("rejects adding a product that no longer exists", async () => {
    const buyer = await createBuyer();

    const result = await toggleWishlistItem(buyer.id, "not-a-real-product-id", "add");

    expect(result.ok).toBe(false);
    expect(await getWishlistItemCount(buyer.id)).toBe(0);
  });

  it("removes a wishlisted product", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);
    await toggleWishlistItem(buyer.id, product.id, "add");

    const result = await toggleWishlistItem(buyer.id, product.id, "remove");

    expect(result.ok).toBe(true);
    expect(await isProductWishlisted(buyer.id, product.id)).toBe(false);
  });

  it("removing a product that was never wishlisted is a harmless no-op", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);

    const result = await toggleWishlistItem(buyer.id, product.id, "remove");

    expect(result.ok).toBe(true);
  });

  it("scopes wishlists per buyer — one buyer's add doesn't affect another's", async () => {
    const buyerA = await createBuyer();
    const buyerB = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);

    await toggleWishlistItem(buyerA.id, product.id, "add");

    expect(await isProductWishlisted(buyerA.id, product.id)).toBe(true);
    expect(await isProductWishlisted(buyerB.id, product.id)).toBe(false);
  });
});

describe("listWishlistForBuyer", () => {
  it("includes a wishlisted product even after the seller deactivates it", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);
    await toggleWishlistItem(buyer.id, product.id, "add");

    await prisma.product.update({ where: { id: product.id }, data: { status: "inactive" } });
    const { items } = await listWishlistForBuyer(buyer.id);

    expect(items.map((i) => i.productId)).toContain(product.id);
  });

  it("an empty wishlist returns no items and no next page", async () => {
    const buyer = await createBuyer();

    const { items, hasNextPage } = await listWishlistForBuyer(buyer.id);

    expect(items).toHaveLength(0);
    expect(hasNextPage).toBe(false);
  });
});

describe("getCoPurchasedProducts", () => {
  it("returns an empty array on cold start — no shown-empty section, per release-2.md", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);

    expect(await getCoPurchasedProducts(product.id)).toEqual([]);
  });

  it("ranks products by how many distinct buyers bought both, excluding the product itself", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const anchor = await createActiveProduct(profile.id, category.id, { stockQty: 10 });
    const popular = await createActiveProduct(profile.id, category.id, { stockQty: 10 });
    const rare = await createActiveProduct(profile.id, category.id, { stockQty: 10 });

    const buyerA = await createBuyer();
    const buyerB = await createBuyer();
    const buyerC = await createBuyer();

    // anchor + popular bought together (same order) by 2 buyers; anchor + rare by 1.
    await placePaidOrder(buyerA.id, [anchor.variants[0].id, popular.variants[0].id]);
    await placePaidOrder(buyerB.id, [anchor.variants[0].id, popular.variants[0].id]);
    await placePaidOrder(buyerC.id, [anchor.variants[0].id, rare.variants[0].id]);

    const results = await getCoPurchasedProducts(anchor.id);

    expect(results.map((p) => p.id)).toEqual([popular.id, rare.id]);
  });

  it("excludes a co-purchased product that's since gone inactive", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const anchor = await createActiveProduct(profile.id, category.id, { stockQty: 10 });
    const companion = await createActiveProduct(profile.id, category.id, { stockQty: 10 });
    const buyer = await createBuyer();

    await placePaidOrder(buyer.id, [anchor.variants[0].id, companion.variants[0].id]);
    await prisma.product.update({ where: { id: companion.id }, data: { status: "inactive" } });

    expect(await getCoPurchasedProducts(anchor.id)).toEqual([]);
  });
});
