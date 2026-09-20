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

const AUDIT_LOG_EXPORT_CAP = 10_000;

export async function getSellerSalesReport(sellerId: string, range: ReportRange) {
  const [rows, summary] = await Promise.all([
    getSellerSalesRows(sellerId, range),
    getSellerSalesSummary(sellerId, range),
  ]);
  return { rows, summary };
}

export function getSellerPayoutHistory(sellerId: string) {
  return getSellerPayoutHistoryRows(sellerId);
}

export function getPlatformRevenueReport(range: ReportRange) {
  return getPlatformRevenueBySeller(range);
}

export function getSellerPerformanceReport() {
  return getSellerPerformanceRows();
}

export function getAuditLogExportRows() {
  return listAuditLogEntries({ take: AUDIT_LOG_EXPORT_CAP });
}
