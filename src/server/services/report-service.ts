import "server-only";
import {
  getSellerSalesRows,
  getSellerSalesSummary,
  getSellerPayoutHistoryRows,
  getPlatformRevenueBySeller,
  getSellerPerformanceRows,
  type ReportRange,
} from "@/server/data/reports";
import { listAuditLogEntries } from "@/server/data/audit-log";
import { splitPage } from "@/lib/pagination";

const AUDIT_LOG_EXPORT_CAP = 10_000;

// `page` omitted (as the CSV export route does) returns the complete, unpaginated dataset.
export async function getSellerSalesReport(sellerId: string, range: ReportRange, page?: number) {
  const [rawRows, summary] = await Promise.all([
    getSellerSalesRows(sellerId, range, { page }),
    getSellerSalesSummary(sellerId, range),
  ]);
  const { items: rows, hasNextPage } = page ? splitPage(rawRows) : { items: rawRows, hasNextPage: false };
  return { rows, summary, hasNextPage };
}

export function getSellerPayoutHistory(sellerId: string) {
  return getSellerPayoutHistoryRows(sellerId);
}

// `page` omitted (as the CSV export route does) returns every seller's row.
export async function getPlatformRevenueReport(range: ReportRange, page?: number) {
  const { rows: rawRows, totals } = await getPlatformRevenueBySeller(range, { page });
  const { items: rows, hasNextPage } = page ? splitPage(rawRows) : { items: rawRows, hasNextPage: false };
  return { rows, totals, hasNextPage };
}

export function getSellerPerformanceReport() {
  return getSellerPerformanceRows();
}

export function getAuditLogExportRows() {
  return listAuditLogEntries({ take: AUDIT_LOG_EXPORT_CAP });
}
