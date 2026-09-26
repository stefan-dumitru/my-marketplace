import "server-only";
import { prisma } from "@/lib/prisma";

/** Per-seller totals for every SellerOrder on a paid Order created within [dayStart, dayEnd). */
export function getPaidSellerOrderTotalsForDay(dayStart: Date, dayEnd: Date) {
  return prisma.sellerOrder.groupBy({
    by: ["sellerId"],
    where: { order: { status: "paid", createdAt: { gte: dayStart, lt: dayEnd } } },
    _count: { _all: true },
    _sum: { subtotal: true, commissionAmount: true },
  });
}

/** The platform-wide order count independent of the per-seller groups above — a multi-seller
 *  checkout is one Order but contributes to several sellers' groups, so summing group counts
 *  would overcount it; this counts distinct Orders instead. */
export function countPaidOrdersForDay(dayStart: Date, dayEnd: Date) {
  return prisma.order.count({ where: { status: "paid", createdAt: { gte: dayStart, lt: dayEnd } } });
}

export async function upsertDailySellerSales(
  date: Date,
  rows: { sellerId: string; orderCount: number; revenue: number; commissionAmount: number }[]
) {
  await Promise.all(
    rows.map((row) =>
      prisma.dailySellerSales.upsert({
        where: { sellerId_date: { sellerId: row.sellerId, date } },
        create: { date, ...row },
        update: {
          orderCount: row.orderCount,
          revenue: row.revenue,
          commissionAmount: row.commissionAmount,
        },
      })
    )
  );
}

export function upsertDailyPlatformSales(
  date: Date,
  data: { orderCount: number; gmv: number; commissionAmount: number }
) {
  return prisma.dailyPlatformSales.upsert({
    where: { date },
    create: { date, ...data },
    update: data,
  });
}
