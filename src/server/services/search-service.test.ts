import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getProductsIndex, isSearchConfigured } from "@/lib/search";
import { inngest } from "@/lib/inngest";
import { loadSearchDocuments } from "@/server/data/search-documents";
import { setProductStatusForSeller } from "@/server/data/products";
import { listActiveProductsForStorefront } from "@/server/services/product-service";
import { reindexAllProducts, suggestProducts, syncTarget } from "@/server/services/search-service";
import { createApprovedSeller, createBuyer, createCategory, createActiveProduct } from "@test/helpers";

// A minimal in-memory stand-in for the Meilisearch index — every call is observable and nothing
// leaves the process.
function fakeIndex(overrides: Record<string, unknown> = {}) {
  const task = { waitTask: async () => ({}) };
  const index = {
    addDocuments: vi.fn(() => task),
    deleteDocuments: vi.fn(() => task),
    deleteAllDocuments: vi.fn(() => task),
    search: vi.fn(async () => ({ hits: [], facetDistribution: {} })),
    ...overrides,
  };
  vi.mocked(getProductsIndex).mockReturnValue(index as never);
  return index;
}

beforeEach(() => {
  vi.mocked(isSearchConfigured).mockReturnValue(true);
});

describe("loadSearchDocuments", () => {
  it("builds a document with price range and approved-review rating for a visible product", async () => {
    const { profile } = await createApprovedSeller({ storeName: "Docs Store" });
    const category = await createCategory({ name: "Gadgets" });
    const product = await createActiveProduct(profile.id, category.id, { name: "Test Gadget", price: 25 });
    await prisma.productVariant.create({ data: { productId: product.id, sku: "ALT-1", price: 75, stockQty: 1 } });
    const buyer = await createBuyer();
    const order = await prisma.order.create({
      data: { orderNumber: "ORD-DOC-1", buyerId: buyer.id, totalAmount: 25, shippingAddressSnapshot: {} },
    });
    const sellerOrder = await prisma.sellerOrder.create({
      data: { orderId: order.id, sellerId: profile.id, subtotal: 25, commissionAmount: 2 },
    });
    const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: product.id }, orderBy: { id: "asc" } });
    const item = await prisma.orderItem.create({
      data: {
        sellerOrderId: sellerOrder.id,
        productVariantId: variant.id,
        productNameSnapshot: "x",
        unitPriceSnapshot: 25,
        quantity: 1,
        lineTotal: 25,
      },
    });
    await prisma.review.create({
      data: { productId: product.id, buyerId: buyer.id, orderItemId: item.id, rating: 4, title: "t", body: "b", status: "approved" },
    });

    const { documents, removedIds } = await loadSearchDocuments([product.id]);

    expect(removedIds).toEqual([]);
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      id: product.id,
      name: "Test Gadget",
      categoryName: "Gadgets",
      sellerName: "Docs Store",
      minPrice: 25,
      maxPrice: 75,
      rating: 4,
      reviewCount: 1,
    });
  });

  it("marks inactive, pending, suspended-seller and nonexistent products for removal", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const inactive = await createActiveProduct(profile.id, category.id, { status: "inactive" });
    const pending = await createActiveProduct(profile.id, category.id, { status: "pending_review" });
    const suspended = await createApprovedSeller();
    const hiddenBySeller = await createActiveProduct(suspended.profile.id, category.id);
    await prisma.sellerProfile.update({ where: { id: suspended.profile.id }, data: { status: "suspended" } });

    const ids = [inactive.id, pending.id, hiddenBySeller.id, "does-not-exist"];
    const { documents, removedIds } = await loadSearchDocuments(ids);

    expect(documents).toEqual([]);
    expect([...removedIds].sort()).toEqual([...ids].sort());
  });
});

describe("syncTarget", () => {
  it("upserts visible products and deletes the rest in one pass", async () => {
    const index = fakeIndex();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const live = await createActiveProduct(profile.id, category.id);
    const gone = await createActiveProduct(profile.id, category.id, { status: "inactive" });

    const result = await syncTarget({ productIds: [live.id, gone.id] });

    expect(result).toEqual({ upserted: 1, removed: 1 });
    expect(index.addDocuments).toHaveBeenCalledWith([expect.objectContaining({ id: live.id })]);
    expect(index.deleteDocuments).toHaveBeenCalledWith([gone.id]);
  });

  it("expands a sellerId target to all of that seller's products", async () => {
    const index = fakeIndex();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const a = await createActiveProduct(profile.id, category.id);
    const b = await createActiveProduct(profile.id, category.id);

    await syncTarget({ sellerId: profile.id });

    const sent = (index.addDocuments.mock.calls[0] as unknown as [{ id: string }[]])[0].map((d) => d.id);
    expect([...sent].sort()).toEqual([a.id, b.id].sort());
  });

  it("is a no-op when search isn't configured", async () => {
    vi.mocked(isSearchConfigured).mockReturnValue(false);
    const index = fakeIndex();

    await syncTarget({ productIds: ["anything"] });

    expect(index.addDocuments).not.toHaveBeenCalled();
    expect(index.deleteDocuments).not.toHaveBeenCalled();
  });
});

describe("reindexAllProducts", () => {
  it("clears the index first and re-adds only storefront-visible products", async () => {
    const index = fakeIndex();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const live = await createActiveProduct(profile.id, category.id);
    await createActiveProduct(profile.id, category.id, { status: "pending_review" });

    const result = await reindexAllProducts();

    expect(result).toEqual({ upserted: 1 });
    expect(index.deleteAllDocuments).toHaveBeenCalledOnce();
    expect(index.addDocuments).toHaveBeenCalledWith([expect.objectContaining({ id: live.id })]);
  });
});

describe("storefront search ranking", () => {
  it("uses the engine's ranking order and passes escaped filters through", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const first = await createActiveProduct(profile.id, category.id, { name: "Alpha" });
    const second = await createActiveProduct(profile.id, category.id, { name: "Beta" });
    const index = fakeIndex({ search: vi.fn(async () => ({ hits: [{ id: second.id }, { id: first.id }] })) });

    const { products } = await listActiveProductsForStorefront({ q: "whatever", brand: 'Evil" OR 1=1 ' });

    expect(products.map((p) => p.id)).toEqual([second.id, first.id]);
    const [, params] = index.search.mock.calls[0] as unknown as [string, { filter: string[] }];
    expect(params.filter).toEqual(['brand = "Evil\\" OR 1=1 "']);
  });

  it("falls back to the Postgres search when the engine throws", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const match = await createActiveProduct(profile.id, category.id, { name: "Wireless Keyboard" });
    fakeIndex({
      search: vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    });

    const { products } = await listActiveProductsForStorefront({ q: "keyboard" });

    expect(products.map((p) => p.id)).toEqual([match.id]);
  });

  it("drops a stale hit whose product has since been deactivated", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const live = await createActiveProduct(profile.id, category.id);
    const stale = await createActiveProduct(profile.id, category.id, { status: "inactive" });
    fakeIndex({ search: vi.fn(async () => ({ hits: [{ id: stale.id }, { id: live.id }] })) });

    const { products } = await listActiveProductsForStorefront({ q: "x" });

    expect(products.map((p) => p.id)).toEqual([live.id]);
  });
});

describe("suggestProducts", () => {
  it("returns products plus the top category/brand chips with display names", async () => {
    const category = await createCategory({ name: "Electronics" });
    fakeIndex({
      search: vi.fn(async () => ({
        hits: [{ id: "p1", slug: "p-1", name: "Phone", image: null, minPrice: 10 }],
        facetDistribution: { category: { [category.slug]: 5, ghost: 1 }, brand: { Acme: 4, Zeta: 1 } },
      })),
    });

    const result = await suggestProducts("pho");

    expect(result.products).toHaveLength(1);
    expect(result.categories).toEqual([{ slug: category.slug, name: "Electronics" }]);
    expect(result.brands).toEqual(["Acme"]);
  });
});

describe("index sync triggers", () => {
  it("enqueues a sync event when a seller deactivates a product", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);

    await setProductStatusForSeller(profile.id, product.id, "inactive");

    expect(inngest.send).toHaveBeenCalledWith({ name: "search/sync.requested", data: { productIds: [product.id] } });
  });

  it("does not enqueue anything when search isn't configured", async () => {
    vi.mocked(isSearchConfigured).mockReturnValue(false);
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);

    await setProductStatusForSeller(profile.id, product.id, "inactive");

    expect(inngest.send).not.toHaveBeenCalled();
  });
});
