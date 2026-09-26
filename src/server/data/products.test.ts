import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listActiveProducts } from "@/server/data/products";
import { suspendSeller } from "@/server/services/seller-service";
import { createBuyer, createApprovedSeller, createCategory, createActiveProduct } from "@test/helpers";

describe("listActiveProducts", () => {
  it("excludes inactive products", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const active = await createActiveProduct(profile.id, category.id, { name: "Visible Widget" });
    await createActiveProduct(profile.id, category.id, { name: "Hidden Widget", status: "inactive" });

    const { products } = await listActiveProducts();

    const ids = products.map((p) => p.id);
    expect(ids).toContain(active.id);
    expect(products).toHaveLength(1);
  });

  it("excludes products whose seller has since been suspended", async () => {
    const { profile } = await createApprovedSeller();
    const admin = await createBuyer();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);

    await suspendSeller(profile.id, admin.id);
    const { products } = await listActiveProducts();

    expect(products.map((p) => p.id)).not.toContain(product.id);
  });

  it("filters by category slug", async () => {
    const { profile } = await createApprovedSeller();
    const categoryA = await createCategory({ name: "Books" });
    const categoryB = await createCategory({ name: "Toys" });
    const productA = await createActiveProduct(profile.id, categoryA.id, { name: "A Book" });
    await createActiveProduct(profile.id, categoryB.id, { name: "A Toy" });

    const { products } = await listActiveProducts({ categorySlug: categoryA.slug });

    expect(products).toHaveLength(1);
    expect(products[0].id).toBe(productA.id);
  });

  it("finds a product by name via full-text search", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const match = await createActiveProduct(profile.id, category.id, { name: "Wireless Keyboard" });
    await createActiveProduct(profile.id, category.id, { name: "Garden Hose" });

    const { products } = await listActiveProducts({ q: "keyboard" });

    expect(products.map((p) => p.id)).toContain(match.id);
    expect(products.map((p) => p.id)).not.toContain(undefined);
  });

  it("paginates with zero overlap between consecutive pages", async () => {
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const PAGE_SIZE = 24;
    const total = PAGE_SIZE + 5;
    const baseTime = Date.now();
    for (let i = 0; i < total; i++) {
      await prisma.product.create({
        data: {
          sellerId: profile.id,
          categoryId: category.id,
          sku: `pg-sku-${i}`,
          name: `Paginated Product ${i}`,
          slug: `paginated-product-${i}`,
          status: "active",
          images: [],
          createdAt: new Date(baseTime - i * 1000),
          variants: { create: [{ sku: `pg-var-${i}`, price: 10, stockQty: 5 }] },
        },
      });
    }

    const page1 = await listActiveProducts({ page: 1 });
    const page2 = await listActiveProducts({ page: 2 });

    expect(page1.products).toHaveLength(PAGE_SIZE);
    expect(page1.hasNextPage).toBe(true);
    expect(page2.products).toHaveLength(5);
    expect(page2.hasNextPage).toBe(false);

    const page1Ids = new Set(page1.products.map((p) => p.id));
    const overlap = page2.products.filter((p) => page1Ids.has(p.id));
    expect(overlap).toHaveLength(0);
  });
});
