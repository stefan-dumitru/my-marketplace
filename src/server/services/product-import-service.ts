import "server-only";
import { parse } from "csv-parse/sync";
import { sendEmail } from "@/lib/email";
import { createAuditLog } from "@/server/data/audit-log";
import { notifyUser } from "@/server/services/notification-service";
import { getCategoryBySlug } from "@/server/data/categories";
import {
  createProductForSeller,
  updateProductForSeller,
  updateProductAttributesForSeller,
} from "@/server/data/products";
import {
  createImportBatch,
  completeImportBatch,
  insertImportBatchRecords,
  getImportBatchForSeller,
  listImportBatchesForSeller,
  findProductsBySellerAndSkus,
  deactivateProductsNotInSkuSet,
} from "@/server/data/product-import";
import { uniqueProductSlug } from "@/server/services/product-service";
import {
  importRowSkuSchema,
  importRowBaseSchema,
  importRowFullSchema,
} from "@/lib/validations/product-import";
import type { ImportMode } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type ImportProductsResult =
  | { ok: true; batchId: string }
  | { ok: false; formError: string };

const MAX_ROWS = 100;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

type PendingRecord = {
  importBatchId: string;
  sku: string;
  action: "created" | "updated" | "skipped" | "failed" | "deactivated";
  errorMessage?: string;
  beforeValue?: Prisma.InputJsonValue;
  afterValue?: Prisma.InputJsonValue;
};

export function getImportBatch(sellerId: string, batchId: string) {
  return getImportBatchForSeller(sellerId, batchId);
}

export function getImportBatches(sellerId: string) {
  return listImportBatchesForSeller(sellerId);
}

export async function importProducts(
  sellerId: string,
  actorUserId: string,
  sellerEmail: string,
  mode: ImportMode,
  csvText: string
): Promise<ImportProductsResult> {
  let rawRows: Record<string, string>[];
  try {
    rawRows = parse(csvText, { columns: true, trim: true, skip_empty_lines: true });
  } catch {
    return { ok: false, formError: "Couldn't parse this file — make sure it's a valid CSV." };
  }

  if (rawRows.length === 0) {
    return { ok: false, formError: "The file has no data rows." };
  }
  if (rawRows.length > MAX_ROWS) {
    return {
      ok: false,
      formError: `Files with more than ${MAX_ROWS} rows aren't supported yet — please split into smaller files.`,
    };
  }

  // Last-occurrence-wins: find which row index "wins" per SKU, and record every earlier
  // duplicate as skipped/superseded up front (data-model.md's explicit rule).
  const winningIndexBySku = new Map<string, number>();
  rawRows.forEach((row, index) => {
    const sku = row.sku?.trim();
    if (sku) winningIndexBySku.set(sku, index);
  });

  const batch = await createImportBatch(sellerId, mode, rawRows.length);
  const records: PendingRecord[] = [];
  let succeededRows = 0;
  let failedRows = 0;

  const allSkus = [...new Set(rawRows.map((r) => r.sku?.trim()).filter((s): s is string => !!s))];
  const existingProducts = await findProductsBySellerAndSkus(sellerId, allSkus);
  const existingBySku = new Map(existingProducts.map((p) => [p.sku, p]));

  for (const [rowIndex, row] of rawRows.entries()) {
    const skuParsed = importRowSkuSchema.safeParse({ sku: row.sku });
    if (!skuParsed.success) {
      records.push({
        importBatchId: batch.id,
        sku: row.sku ?? "",
        action: "failed",
        errorMessage: "Invalid or missing SKU.",
      });
      failedRows += 1;
      continue;
    }
    const { sku } = skuParsed.data;

    // Superseded by a later row with the same SKU in this file.
    if (winningIndexBySku.get(sku) !== rowIndex) {
      records.push({
        importBatchId: batch.id,
        sku,
        action: "skipped",
        errorMessage: "Superseded by a later row with the same SKU in this file.",
      });
      continue;
    }

    const existing = existingBySku.get(sku);

    try {
      if (mode === "add_only") {
        if (existing) {
          records.push({ importBatchId: batch.id, sku, action: "skipped", errorMessage: "SKU already exists — left untouched." });
          continue;
        }
        const created = await createProductRow(sellerId, sku, row);
        if (!created.ok) {
          records.push({ importBatchId: batch.id, sku, action: "failed", errorMessage: created.error });
          failedRows += 1;
          continue;
        }
        records.push({ importBatchId: batch.id, sku, action: "created", afterValue: created.snapshot });
        succeededRows += 1;
      } else if (mode === "full_replace") {
        if (existing) {
          const updated = await updateProductRow(sellerId, existing.id, sku, row);
          if (!updated.ok) {
            records.push({ importBatchId: batch.id, sku, action: "failed", errorMessage: updated.error });
            failedRows += 1;
            continue;
          }
          records.push({ importBatchId: batch.id, sku, action: "updated", afterValue: updated.snapshot });
          succeededRows += 1;
        } else {
          const created = await createProductRow(sellerId, sku, row);
          if (!created.ok) {
            records.push({ importBatchId: batch.id, sku, action: "failed", errorMessage: created.error });
            failedRows += 1;
            continue;
          }
          records.push({ importBatchId: batch.id, sku, action: "created", afterValue: created.snapshot });
          succeededRows += 1;
        }
      } else {
        // attribute_update
        if (!existing) {
          records.push({
            importBatchId: batch.id,
            sku,
            action: "failed",
            errorMessage: "SKU not found — attribute-update mode never creates new products.",
          });
          failedRows += 1;
          continue;
        }
        const parsed = importRowBaseSchema.safeParse(row);
        if (!parsed.success) {
          records.push({ importBatchId: batch.id, sku, action: "failed", errorMessage: firstZodError(parsed.error) });
          failedRows += 1;
          continue;
        }
        const result = await updateProductAttributesForSeller(sellerId, existing.id, {
          price: parsed.data.price,
          stockQty: parsed.data.stockQty,
        });
        if (!result) {
          records.push({ importBatchId: batch.id, sku, action: "failed", errorMessage: "Product not found." });
          failedRows += 1;
          continue;
        }
        records.push({
          importBatchId: batch.id,
          sku,
          action: "updated",
          afterValue: { price: parsed.data.price, stockQty: parsed.data.stockQty },
        });
        succeededRows += 1;
      }
    } catch {
      records.push({ importBatchId: batch.id, sku, action: "failed", errorMessage: "Unexpected error processing this row." });
      failedRows += 1;
    }
  }

  if (mode === "full_replace") {
    const keepSkus = [...winningIndexBySku.keys()];
    const deactivated = await deactivateProductsNotInSkuSet(sellerId, keepSkus);
    for (const product of deactivated) {
      records.push({
        importBatchId: batch.id,
        sku: product.sku,
        action: "deactivated",
        beforeValue: { status: "active" },
        afterValue: { status: "inactive" },
      });
    }
  }

  await insertImportBatchRecords(records);
  const status = succeededRows > 0 ? "completed" : "failed";
  await completeImportBatch(batch.id, { status, succeededRows, failedRows });

  await createAuditLog({
    actorUserId,
    action: "product_import_completed",
    entityType: "ImportBatch",
    entityId: batch.id,
    afterValue: { mode, totalRows: rawRows.length, succeededRows, failedRows },
  });

  const importTitle = "Bulk import completed";
  const importBody = `Your product import finished: ${succeededRows} row(s) succeeded, ${failedRows} row(s) failed, out of ${rawRows.length} total.`;
  await sendEmail({
    to: sellerEmail,
    subject: importTitle,
    html: `<p>${importBody}</p>`,
    text: importBody,
  }).catch(() => {
    // Best-effort notification — an email failure shouldn't fail an otherwise-completed import.
  });
  await notifyUser({
    userId: actorUserId,
    type: "import_completed",
    title: importTitle,
    body: importBody,
    link: `/seller/products/import/${batch.id}`,
  }).catch(() => {});

  return { ok: true, batchId: batch.id };
}

function firstZodError(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid row.";
}

async function createProductRow(
  sellerId: string,
  sku: string,
  row: Record<string, string>
): Promise<{ ok: true; snapshot: Prisma.InputJsonValue } | { ok: false; error: string }> {
  const parsed = importRowFullSchema.safeParse({ ...row, sku });
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

  const category = await getCategoryBySlug(parsed.data.categorySlug);
  if (!category) return { ok: false, error: `Category "${parsed.data.categorySlug}" not found.` };

  const slug = await uniqueProductSlug(parsed.data.name);
  await createProductForSeller(sellerId, {
    categoryId: category.id,
    sku,
    name: parsed.data.name,
    slug,
    description: parsed.data.description || undefined,
    brand: parsed.data.brand || undefined,
    images: parsed.data.imageUrl ? [parsed.data.imageUrl] : [],
    price: parsed.data.price,
    stockQty: parsed.data.stockQty,
  });

  return {
    ok: true,
    snapshot: { name: parsed.data.name, price: parsed.data.price, stockQty: parsed.data.stockQty },
  };
}

async function updateProductRow(
  sellerId: string,
  productId: string,
  sku: string,
  row: Record<string, string>
): Promise<{ ok: true; snapshot: Prisma.InputJsonValue } | { ok: false; error: string }> {
  const parsed = importRowFullSchema.safeParse({ ...row, sku });
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

  const category = await getCategoryBySlug(parsed.data.categorySlug);
  if (!category) return { ok: false, error: `Category "${parsed.data.categorySlug}" not found.` };

  const updated = await updateProductForSeller(sellerId, productId, {
    categoryId: category.id,
    name: parsed.data.name,
    description: parsed.data.description || undefined,
    brand: parsed.data.brand || undefined,
    images: parsed.data.imageUrl ? [parsed.data.imageUrl] : [],
    price: parsed.data.price,
    stockQty: parsed.data.stockQty,
  });
  if (!updated) return { ok: false, error: "Product not found." };

  return {
    ok: true,
    snapshot: { name: parsed.data.name, price: parsed.data.price, stockQty: parsed.data.stockQty },
  };
}

export const IMPORT_FILE_LIMITS = { maxRows: MAX_ROWS, maxFileBytes: MAX_FILE_BYTES };
