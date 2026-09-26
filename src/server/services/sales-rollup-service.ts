import "server-only";
import {
  countPaidOrdersForDay,
  getPaidSellerOrderTotalsForDay,
  upsertDailyPlatformSales,
  upsertDailySellerSales,
} from "@/server/data/sales-rollup";

/** Midnight UTC for whatever calendar day `d` falls on — DailySellerSales/DailyPlatformSales.date
 *  is a plain @db.Date column, so every row for the same day must key off the exact same instant
 *  regardless of the server's local timezone. */
function dateOnlyUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function yesterdayUTC(now: Date = new Date()): Date {
  const today = dateOnlyUTC(now);
  return new Date(today.getTime() - 24 * 60 * 60 * 1000);
}

export type DailySalesRollupSummary = {
  date: Date;
  sellerCount: number;
  orderCount: number;
  gmv: number;
  commissionAmount: number;
};

/**
 * Populates DailySellerSales + DailyPlatformSales for one calendar day — idempotent (upsert, not
 * increment), so a redelivered/retried run just recomputes the same totals rather than double-
 * counting. Called nightly by inngest/functions.ts for "yesterday" (the last fully completed day
 * — a day still in progress would give an incomplete, misleading total), per functional.md >
 * Search & Reporting.
 */
export async function computeDailySalesRollup(targetDate: Date): Promise<DailySalesRollupSummary> {
  const date = dateOnlyUTC(targetDate);
  const dayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000);

  const [groups, orderCount] = await Promise.all([
    getPaidSellerOrderTotalsForDay(date, dayEnd),
    countPaidOrdersForDay(date, dayEnd),
  ]);

  const sellerRows = groups.map((g) => ({
    sellerId: g.sellerId,
    orderCount: g._count._all,
    revenue: Number(g._sum.subtotal ?? 0),
    commissionAmount: Number(g._sum.commissionAmount ?? 0),
  }));

  await upsertDailySellerSales(date, sellerRows);

  // GMV/commission are additive across sellers (a multi-seller Order's totalAmount is exactly the
  // sum of its SellerOrders' subtotals — see orders.ts), so summing the per-seller rows is exact;
  // only orderCount needed its own distinct-Order count (see countPaidOrdersForDay's doc comment).
  const gmv = sellerRows.reduce((sum, r) => sum + r.revenue, 0);
  const commissionAmount = sellerRows.reduce((sum, r) => sum + r.commissionAmount, 0);
  await upsertDailyPlatformSales(date, { orderCount, gmv, commissionAmount });

  return { date, sellerCount: sellerRows.length, orderCount, gmv, commissionAmount };
}
