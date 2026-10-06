import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createProduct,
  updateProduct,
  listProductsForSeller,
  approveProduct,
  rejectProduct,
  getProductForStorefront,
} from "@/server/services/product-service";
import { createOrderFromCart } from "@/server/data/orders";
import { createAdmin, createApprovedSeller, createCategory, createBuyer } from "@test/helpers";

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

function productInput(categoryId: string, overrides?: Partial<Parameters<typeof createProduct>[1]>) {
  return {
    categoryId,
    name: "Wireless Mouse",
    description: "",
    brand: "",
    sku: "sku-wm-1",
    price: 25,
    stockQty: 10,
    ...overrides,
  };
}

describe("createProduct", () => {
  // Note: whether a *pending* seller can create products is enforced at the Server Action layer
  // (createProductAction redirects unless context.profile.status === "approved"), not inside this
  // service function itself — that layer isn't exercised by direct service-level tests, so this
  // gap is a layering fact, not a missing feature. See account-service's wrong-confirm-email gap.
  it("creates a product for the seller", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();

    const result = await createProduct(profile.id, productInput(category.id), []);

    expect(result.ok).toBe(true);
    const product = await prisma.product.findUniqueOrThrow({ where: { sellerId_sku: { sellerId: profile.id, sku: "sku-wm-1" } } });
    expect(product.status).toBe("pending_review");
  });

  it("rejects a duplicate SKU for the same seller", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    await createProduct(profile.id, productInput(category.id), []);

    const result = await createProduct(profile.id, productInput(category.id), []);

    expect(result.ok).toBe(false);
  });
});

describe("listProductsForSeller", () => {
  it("lists only the calling seller's own products", async () => {
    const { profile: sellerA } = await createApprovedSeller();
    const { profile: sellerB } = await createApprovedSeller();
    const category = await createCategory();
    await createProduct(sellerA.id, productInput(category.id, { sku: "a-1" }), []);
    await createProduct(sellerB.id, productInput(category.id, { sku: "b-1" }), []);

    const { products } = await listProductsForSeller(sellerA.id);

    expect(products).toHaveLength(1);
    expect(products[0].sellerId).toBe(sellerA.id);
  });
});

describe("updateProduct", () => {
  it("updates the seller's own product", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    await createProduct(profile.id, productInput(category.id), []);
    const product = await prisma.product.findUniqueOrThrow({
      where: { sellerId_sku: { sellerId: profile.id, sku: "sku-wm-1" } },
    });

    const result = await updateProduct(
      profile.id,
      product.id,
      { categoryId: category.id, name: "Wireless Mouse Pro", description: "", brand: "", price: 30, stockQty: 8 },
      []
    );

    expect(result.ok).toBe(true);
    const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(updated.name).toBe("Wireless Mouse Pro");
  });

  it("cannot update another seller's product", async () => {
    const { profile: owner } = await createApprovedSeller();
    const { profile: intruder } = await createApprovedSeller();
    const category = await createCategory();
    await createProduct(owner.id, productInput(category.id), []);
    const product = await prisma.product.findUniqueOrThrow({
      where: { sellerId_sku: { sellerId: owner.id, sku: "sku-wm-1" } },
    });

    const result = await updateProduct(
      intruder.id,
      product.id,
      { categoryId: category.id, name: "Hijacked", description: "", brand: "", price: 1, stockQty: 1 },
      []
    );

    expect(result.ok).toBe(false);
    const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(unchanged.name).toBe("Wireless Mouse");
  });
});

describe("admin moderation", () => {
  it("approving a pending product creates an audit log entry", async () => {
    const { profile } = await createApprovedSeller();
    const admin = await createAdmin();
    const category = await createCategory();
    await createProduct(profile.id, productInput(category.id), []);
    const product = await prisma.product.findUniqueOrThrow({
      where: { sellerId_sku: { sellerId: profile.id, sku: "sku-wm-1" } },
    });

    const result = await approveProduct(product.id, admin.id);

    expect(result.ok).toBe(true);
    const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(updated.status).toBe("active");
    const log = await prisma.auditLog.findFirst({ where: { entityId: product.id, action: "product_approved" } });
    expect(log).not.toBeNull();
  });

  it("rejecting a pending product creates an audit log entry and hides it from the storefront", async () => {
    const { profile } = await createApprovedSeller();
    const admin = await createAdmin();
    const category = await createCategory();
    await createProduct(profile.id, productInput(category.id), []);
    const product = await prisma.product.findUniqueOrThrow({
      where: { sellerId_sku: { sellerId: profile.id, sku: "sku-wm-1" } },
    });

    const result = await rejectProduct(product.id, admin.id);

    expect(result.ok).toBe(true);
    const log = await prisma.auditLog.findFirst({ where: { entityId: product.id, action: "product_rejected" } });
    expect(log).not.toBeNull();
    const visible = await getProductForStorefront(product.slug);
    expect(visible).toBeNull();
  });

  it("keeps an existing order's productNameSnapshot intact after the product is later deactivated", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const admin = await createAdmin();
    const category = await createCategory();
    await createProduct(profile.id, productInput(category.id), []);
    const product = await prisma.product.findUniqueOrThrow({
      where: { sellerId_sku: { sellerId: profile.id, sku: "sku-wm-1" } },
      include: { variants: true },
    });
    await approveProduct(product.id, admin.id);

    const orderResult = await createOrderFromCart({
      buyerId: buyer.id,
      items: [{ productVariantId: product.variants[0].id, quantity: 1 }],
      shippingAddressSnapshot: ADDRESS_SNAPSHOT,
    });
    expect(orderResult.ok).toBe(true);
    if (!orderResult.ok) return;

    await prisma.product.update({ where: { id: product.id }, data: { status: "inactive" } });

    const orderItem = await prisma.orderItem.findFirstOrThrow({
      where: { productVariantId: product.variants[0].id },
    });
    expect(orderItem.productNameSnapshot).toBe("Wireless Mouse");
  });
});

describe("updateProduct clearing a low-stock alert", () => {
  it("clears lowStockAlertedAt once the seller restocks above the threshold", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    await createProduct(profile.id, productInput(category.id), []);
    const product = await prisma.product.findUniqueOrThrow({
      where: { sellerId_sku: { sellerId: profile.id, sku: "sku-wm-1" } },
      include: { variants: true },
    });
    await prisma.productVariant.update({
      where: { id: product.variants[0].id },
      data: { lowStockAlertedAt: new Date() }, // simulates a prior alert having fired
    });

    await updateProduct(
      profile.id,
      product.id,
      { categoryId: category.id, name: product.name, description: "", brand: "", price: 25, stockQty: 20 },
      []
    );

    const restocked = await prisma.productVariant.findUniqueOrThrow({ where: { id: product.variants[0].id } });
    expect(restocked.lowStockAlertedAt).toBeNull();
  });

  it("leaves lowStockAlertedAt untouched when the restock is still at/under the threshold", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    await createProduct(profile.id, productInput(category.id), []);
    const product = await prisma.product.findUniqueOrThrow({
      where: { sellerId_sku: { sellerId: profile.id, sku: "sku-wm-1" } },
      include: { variants: true },
    });
    const alertedAt = new Date();
    await prisma.productVariant.update({
      where: { id: product.variants[0].id },
      data: { lowStockAlertedAt: alertedAt },
    });

    await updateProduct(
      profile.id,
      product.id,
      { categoryId: category.id, name: product.name, description: "", brand: "", price: 25, stockQty: 3 },
      []
    );

    const stillLow = await prisma.productVariant.findUniqueOrThrow({ where: { id: product.variants[0].id } });
    expect(stillLow.lowStockAlertedAt).toEqual(alertedAt);
  });
});

describe("product specifications", () => {
  const specs = [
    { label: "Battery", value: "20,000 mAh" },
    { label: "Weight", value: "480 g" },
  ];

  async function createWithSpecs(sellerId: string, categoryId: string, specifications?: typeof specs) {
    await createProduct(sellerId, productInput(categoryId, { specifications }), []);
    return prisma.product.findUniqueOrThrow({ where: { sellerId_sku: { sellerId, sku: "sku-wm-1" } } });
  }

  it("stores specifications on create, in order", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();

    const product = await createWithSpecs(profile.id, category.id, specs);

    expect(product.specifications).toEqual(specs);
  });

  it("leaves specifications empty when none are given", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();

    const product = await createWithSpecs(profile.id, category.id);

    expect(product.specifications).toBeNull();
  });

  it("rejects malformed specifications and creates nothing", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();

    const result = await createProduct(
      profile.id,
      productInput(category.id, { specifications: [{ label: "", value: "x" }] }),
      []
    );

    expect(result.ok).toBe(false);
    expect(await prisma.product.count()).toBe(0);
  });

  it("replaces specifications on update, keeps them when not provided, and clears them with an empty list", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createWithSpecs(profile.id, category.id, specs);
    const base = { categoryId: category.id, name: "Wireless Mouse", description: "", brand: "", price: 25, stockQty: 10 };

    await updateProduct(profile.id, product.id, { ...base, specifications: [{ label: "Colour", value: "Black" }] }, []);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).specifications).toEqual([
      { label: "Colour", value: "Black" },
    ]);

    await updateProduct(profile.id, product.id, base, []);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).specifications).toEqual([
      { label: "Colour", value: "Black" },
    ]);

    await updateProduct(profile.id, product.id, { ...base, specifications: [] }, []);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).specifications).toBeNull();
  });

  it("does not let another seller change a product's specifications", async () => {
    const { profile } = await createApprovedSeller();
    const { profile: intruder } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createWithSpecs(profile.id, category.id, specs);

    const result = await updateProduct(
      intruder.id,
      product.id,
      { categoryId: category.id, name: "x1", description: "", brand: "", price: 1, stockQty: 1, specifications: [] },
      []
    );

    expect(result.ok).toBe(false);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).specifications).toEqual(specs);
  });
});
