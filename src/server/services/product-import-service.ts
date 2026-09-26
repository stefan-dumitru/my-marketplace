import "server-only";
import { parse } from "csv-parse/sync";
import { queueEmail } from "@/lib/email";
import { inngest } from "@/lib/inngest";
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
  markImportBatchProcessing,
  completeImportBatch,
  insertImportBatchRecords,
  getImportBatchForSeller,
  listImportBatchesForSeller,
  findProductsBySellerAndSkus,
  deactivateProductsNotInSkuSet,
} from "@/server/data/product-import";
import { uniqueProductSlug } from "@/server/services/product-service";
import { splitPage } from "@/lib/pagination";
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
// Async path (>= 100 rows) ships the parsed rows directly in the Inngest event payload rather
// than persisting to blob storage — that keeps this increment scoped to "stand up Inngest," not
// "also stand up Vercel Blob." Inngest's event payload ceiling is ~512KB; this leaves headroom
// for JSON-encoding overhead. Lifting this to the spec's full ~10,000-row range needs blob
// storage — a separate future increment, not bundled into wiring up the job runner for the first
// time (same scoping call this codebase already made when CSV import itself was first built).
const MAX_ASYNC_BYTES = 400 * 1024;

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

export async function getImportBatches(sellerId: string, page?: number) {
  const rows = await listImportBatchesForSeller(sellerId, { page });
  const { items: batches, hasNextPage } = splitPage(rows);
  return { batches, hasNextPage };
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

  if (rawRows.length < MAX_ROWS) {
    const batch = await createImportBatch(sellerId, mode, rawRows.length);
    return processImportRows(batch, sellerId, actorUserId, sellerEmail, mode, rawRows);
  }

  // >= 100 rows: per performance.md, this runs as a background job instead of inline. The
  // parsed rows travel in the event payload (see MAX_ASYNC_BYTES's comment for why that's
  // capped rather than unlimited) — Buffer.byteLength on the raw text is a reasonable proxy for
  // the payload's eventual JSON size.
  if (Buffer.byteLength(csvText, "utf8") > MAX_ASYNC_BYTES) {
    return {
      ok: false,
      formError: "This file is too large for background processing yet — please split into smaller files.",
    };
  }

  const batch = await createImportBatch(sellerId, mode, rawRows.length);
  await inngest.send({
    name: "product-import/requested",
    data: { batchId: batch.id, sellerId, actorUserId, sellerEmail, mode, rows: rawRows },
  });
  return { ok: true, batchId: batch.id };
}

/**
 * The actual row-processing work, shared by both the synchronous (<100 rows) and background-job
 * (>=100 rows) paths — identical validation/bookkeeping/notifications either way, differing only
 * in *when* it runs. Idempotent: a batch already `completed`/`failed` is a no-op, since Inngest
 * guarantees at-least-once delivery and this must tolerate a redelivered event safely.
 */
export async function processImportRows(
  batch: { id: string; status: string },
  sellerId: string,
  actorUserId: string,
  sellerEmail: string,
  mode: ImportMode,
  rawRows: Record<string, string>[]
): Promise<ImportProductsResult> {
  if (batch.status === "completed" || batch.status === "failed") {
    return { ok: true, batchId: batch.id };
  }
  await markImportBatchProcessing(batch.id);

  // Last-occurrence-wins: find which row index "wins" per SKU, and record every earlier
  // duplicate as skipped/superseded up front (data-model.md's explicit rule).
  const winningIndexBySku = new Map<string, number>();
  rawRows.forEach((row, index) => {
    const sku = row.sku?.trim();
    if (sku) winningIndexBySku.set(sku, index);
  });

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
  await queueEmail({
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
