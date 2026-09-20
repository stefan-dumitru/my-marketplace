import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ImportMode, ImportBatchStatus, ImportRecordAction } from "@/generated/prisma/enums";

export function createImportBatch(sellerId: string, mode: ImportMode, totalRows: number) {
  return prisma.importBatch.create({
    data: { sellerId, mode, totalRows, status: "pending" },
  });
}

export function markImportBatchProcessing(batchId: string) {
  return prisma.importBatch.update({ where: { id: batchId }, data: { status: "processing" } });
}

/** Unscoped by seller — used by the Inngest job handler, which has no request-scoped session. */
export function getImportBatchById(batchId: string) {
  return prisma.importBatch.findUnique({ where: { id: batchId } });
}

export function completeImportBatch(
  batchId: string,
  data: { status: ImportBatchStatus; succeededRows: number; failedRows: number }
) {
  return prisma.importBatch.update({
    where: { id: batchId },
    data: { ...data, completedAt: new Date() },
  });
}

export function insertImportBatchRecords(
  records: {
    importBatchId: string;
    sku: string;
    action: ImportRecordAction;
    errorMessage?: string;
    beforeValue?: Prisma.InputJsonValue;
    afterValue?: Prisma.InputJsonValue;
  }[]
) {
  if (records.length === 0) return Promise.resolve({ count: 0 });
  return prisma.importBatchRecord.createMany({ data: records });
}

export function getImportBatchForSeller(sellerId: string, batchId: string) {
  return prisma.importBatch.findFirst({
    where: { id: batchId, sellerId },
    include: { records: { orderBy: { sku: "asc" } } },
  });
}

export function listImportBatchesForSeller(sellerId: string) {
  return prisma.importBatch.findMany({
    where: { sellerId },
    orderBy: { startedAt: "desc" },
  });
}

/** Bulk existence pre-check — one query for every SKU in a file, instead of one per row. */
export function findProductsBySellerAndSkus(sellerId: string, skus: string[]) {
  return prisma.product.findMany({
    where: { sellerId, sku: { in: skus } },
    select: { id: true, sku: true },
  });
}

/**
 * full_replace only: deactivates this seller's currently-active products whose SKU is absent
 * from the file's winning-SKU set. Reads the affected rows first (to report which SKUs were
 * deactivated) since updateMany doesn't return rows, then updates them by id.
 */
export async function deactivateProductsNotInSkuSet(sellerId: string, keepSkus: string[]) {
  const toDeactivate = await prisma.product.findMany({
    where: { sellerId, status: "active", sku: { notIn: keepSkus } },
    select: { id: true, sku: true },
  });
  if (toDeactivate.length === 0) return [];

  await prisma.product.updateMany({
    where: { id: { in: toDeactivate.map((p) => p.id) } },
    data: { status: "inactive", deactivatedAt: new Date() },
  });
  return toDeactivate;
}
