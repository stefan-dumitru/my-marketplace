import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest";
import { importProducts, processImportRows } from "@/server/services/product-import-service";
import { createActiveProduct, createApprovedSeller, createCategory } from "@test/helpers";

const HEADER = "sku,name,categorySlug,price,stockQty,description,brand,imageUrl";

async function setup() {
  const seller = await createApprovedSeller();
  const category = await createCategory();
  const run = (mode: Parameters<typeof importProducts>[3], rows: string[], header = HEADER) =>
    importProducts(seller.profile.id, seller.user.id, seller.user.email, mode, [header, ...rows].join("\n"));
  return { seller, category, run };
}

const row = (sku: string, name: string, slug: string, price: string | number, stock: string | number, extra = ",,") =>
  `${sku},${name},${slug},${price},${stock},${extra}`;

async function recordsFor(batchId: string) {
  return prisma.importBatchRecord.findMany({ where: { importBatchId: batchId }, orderBy: { sku: "asc" } });
}

describe("importProducts: add_only", () => {
  it("creates products pending review and reports the batch", async () => {
    const { seller, category, run } = await setup();

    const result = await run("add_only", [
      row("SKU-1", "Blue Mug", category.slug, "25.50", 10, "A mug,Acme,"),
      row("SKU-2", "Red Mug", category.slug, 30, 4),
    ]);

    if (!result.ok) throw new Error("import failed");
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: result.batchId } });
    expect(batch).toMatchObject({ status: "completed", totalRows: 2, succeededRows: 2, failedRows: 0 });
    const product = await prisma.product.findFirstOrThrow({
      where: { sellerId: seller.profile.id, sku: "SKU-1" },
      include: { variants: true },
    });
    expect(product).toMatchObject({ name: "Blue Mug", brand: "Acme", description: "A mug", status: "pending_review" });
    expect(Number(product.variants[0].price)).toBe(25.5);
    expect(product.variants[0].stockQty).toBe(10);
    expect((await recordsFor(result.batchId)).map((r) => r.action)).toEqual(["created", "created"]);
    expect(await prisma.auditLog.count({ where: { action: "product_import_completed" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: seller.user.id, type: "import_completed" } })).toBe(1);
  });

  it("leaves a product that already has the SKU untouched", async () => {
    const { seller, category, run } = await setup();
    await createActiveProduct(seller.profile.id, category.id, { name: "Original", price: 10 });
    const existing = await prisma.product.findFirstOrThrow({ where: { sellerId: seller.profile.id } });

    const result = await run("add_only", [row(existing.sku, "Overwritten", category.slug, 99, 1)]);

    if (!result.ok) throw new Error("import failed");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: existing.id } })).name).toBe("Original");
    expect((await recordsFor(result.batchId))[0].action).toBe("skipped");
    expect((await prisma.importBatch.findUniqueOrThrow({ where: { id: result.batchId } })).status).toBe("failed");
  });

  it("lets the last row win when a SKU repeats within the file", async () => {
    const { seller, category, run } = await setup();

    const result = await run("add_only", [
      row("DUP", "First Version", category.slug, 10, 1),
      row("DUP", "Second Version", category.slug, 20, 2),
    ]);

    if (!result.ok) throw new Error("import failed");
    const products = await prisma.product.findMany({ where: { sellerId: seller.profile.id, sku: "DUP" } });
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Second Version");
    expect((await recordsFor(result.batchId)).map((r) => r.action).sort()).toEqual(["created", "skipped"]);
  });

  it("records a clear error for each bad row and keeps the good ones", async () => {
    const { seller, category, run } = await setup();

    const result = await run("add_only", [
      row("GOOD", "Good Product", category.slug, 10, 1),
      row("NEG", "Negative Price", category.slug, -5, 1),
      row("NOCAT", "Unknown Category", "does-not-exist", 10, 1),
      row("FRAC", "Fractional Stock", category.slug, 10, "1.5"),
      row("", "Missing Sku", category.slug, 10, 1),
    ]);

    if (!result.ok) throw new Error("import failed");
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: result.batchId } });
    expect(batch).toMatchObject({ status: "completed", succeededRows: 1, failedRows: 4 });
    expect(await prisma.product.count({ where: { sellerId: seller.profile.id } })).toBe(1);
    const errors = Object.fromEntries((await recordsFor(result.batchId)).map((r) => [r.sku, r.errorMessage]));
    expect(errors.NEG).toMatch(/greater than 0/);
    expect(errors.NOCAT).toMatch(/not found/);
    expect(errors.FRAC).toMatch(/whole number/);
    expect(errors[""]).toMatch(/SKU/);
  });

  it("marks the batch failed when every row fails", async () => {
    const { category, run } = await setup();

    const result = await run("add_only", [row("A", "Bad One", category.slug, 0, 1)]);

    if (!result.ok) throw new Error("import failed");
    expect((await prisma.importBatch.findUniqueOrThrow({ where: { id: result.batchId } })).status).toBe("failed");
  });

  it("scopes SKUs to the importing seller", async () => {
    const { seller, category, run } = await setup();
    const other = await createApprovedSeller();
    await prisma.product.create({
      data: { sellerId: other.profile.id, categoryId: category.id, sku: "SHARED", name: "Theirs", slug: "theirs", status: "active" },
    });

    const result = await run("add_only", [row("SHARED", "Mine", category.slug, 10, 1)]);

    if (!result.ok) throw new Error("import failed");
    expect((await prisma.product.findFirstOrThrow({ where: { sellerId: other.profile.id } })).name).toBe("Theirs");
    expect((await prisma.product.findFirstOrThrow({ where: { sellerId: seller.profile.id } })).name).toBe("Mine");
  });
});

describe("importProducts: full_replace", () => {
  it("updates existing products, adds new ones and deactivates those missing from the file", async () => {
    const { seller, category, run } = await setup();
    const keep = await createActiveProduct(seller.profile.id, category.id, { name: "Keep Me", price: 10 });
    const drop = await createActiveProduct(seller.profile.id, category.id, { name: "Drop Me", price: 10 });
    const keepSku = (await prisma.product.findUniqueOrThrow({ where: { id: keep.id } })).sku;

    const result = await run("full_replace", [
      row(keepSku, "Kept And Renamed", category.slug, 15, 7),
      row("BRAND-NEW", "Brand New", category.slug, 20, 2),
    ]);

    if (!result.ok) throw new Error("import failed");
    const kept = await prisma.product.findUniqueOrThrow({ where: { id: keep.id }, include: { variants: true } });
    expect(kept.name).toBe("Kept And Renamed");
    expect(Number(kept.variants[0].price)).toBe(15);
    expect(await prisma.product.count({ where: { sku: "BRAND-NEW" } })).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: drop.id } })).status).toBe("inactive");
    expect((await recordsFor(result.batchId)).map((r) => r.action).sort()).toEqual(["created", "deactivated", "updated"]);
  });

  it("never deactivates another seller's products", async () => {
    const { category, run } = await setup();
    const other = await createApprovedSeller();
    const theirs = await createActiveProduct(other.profile.id, category.id, { name: "Theirs" });

    await run("full_replace", [row("MINE", "Mine", category.slug, 10, 1)]);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe("active");
  });
});

describe("importProducts: attribute_update", () => {
  it("changes only price and stock of existing products", async () => {
    const { seller, category, run } = await setup();
    const product = await createActiveProduct(seller.profile.id, category.id, { name: "Stay The Same", price: 10, stockQty: 1 });
    const sku = (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).sku;

    const result = await run("attribute_update", [`${sku},99,40`], "sku,price,stockQty");

    if (!result.ok) throw new Error("import failed");
    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, include: { variants: true } });
    expect(after.name).toBe("Stay The Same");
    expect(Number(after.variants[0].price)).toBe(99);
    expect(after.variants[0].stockQty).toBe(40);
  });

  it("fails rows whose SKU does not exist instead of creating products", async () => {
    const { seller, run } = await setup();

    const result = await run("attribute_update", ["NOPE,10,5"], "sku,price,stockQty");

    if (!result.ok) throw new Error("import failed");
    expect(await prisma.product.count({ where: { sellerId: seller.profile.id } })).toBe(0);
    expect((await recordsFor(result.batchId))[0].action).toBe("failed");
  });
});

describe("importProducts: file handling", () => {
  it("rejects an empty file and an unparseable one", async () => {
    const { seller } = await setup();
    const send = (csv: string) =>
      importProducts(seller.profile.id, seller.user.id, seller.user.email, "add_only", csv);

    expect(await send(HEADER)).toEqual({ ok: false, formError: "The file has no data rows." });
    expect(await send('sku,name\n"unterminated,1')).toEqual({
      ok: false,
      formError: "Couldn't parse this file — make sure it's a valid CSV.",
    });
    expect(await prisma.importBatch.count()).toBe(0);
  });

  it("hands files of 100 rows or more to the background job instead of running inline", async () => {
    const { seller, category, run } = await setup();
    const rows = Array.from({ length: 100 }, (_, i) => row(`BULK-${i}`, `Bulk Product ${i}`, category.slug, 10, 1));

    const result = await run("add_only", rows);

    if (!result.ok) throw new Error("import failed");
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "product-import/requested", data: expect.objectContaining({ batchId: result.batchId }) })
    );
    expect(await prisma.product.count({ where: { sellerId: seller.profile.id } })).toBe(0);
    expect((await prisma.importBatch.findUniqueOrThrow({ where: { id: result.batchId } })).status).toBe("pending");
  });

  it("ignores a redelivered job for a batch that already finished", async () => {
    const { seller, category } = await setup();
    const batch = await prisma.importBatch.create({
      data: { sellerId: seller.profile.id, mode: "add_only", totalRows: 1, status: "completed" },
    });

    const result = await processImportRows(
      batch,
      seller.profile.id,
      seller.user.id,
      seller.user.email,
      "add_only",
      [{ sku: "LATE", name: "Late Product", categorySlug: category.slug, price: "10", stockQty: "1" }]
    );

    expect(result).toEqual({ ok: true, batchId: batch.id });
    expect(await prisma.product.count({ where: { sellerId: seller.profile.id } })).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });
});
