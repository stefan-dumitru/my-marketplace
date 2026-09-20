import "server-only";
import { prisma } from "@/lib/prisma";

export type ReportRange = "this_month" | "last_30_days" | "all";

// Plain server-local Date arithmetic, matching dashboard.ts's monthStart()/dayStart() convention
// — no timezone library anywhere else in this codebase to match.
function rangeStart(range: ReportRange): Date | undefined {
  const now = new Date();
  if (range === "this_month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "last_30_days") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return undefined;
}

const SELLER_SALES_ROW_INCLUDE = {
  order: { select: { orderNumber: true, createdAt: true } },
} as const;

export function getSellerSalesRows(sellerId: string, range: ReportRange) {
  const start = rangeStart(range);
  return prisma.sellerOrder.findMany({
    where: { sellerId, ...(start ? { order: { createdAt: { gte: start } } } : {}) },
    orderBy: { order: { createdAt: "desc" } },
    include: SELLER_SALES_ROW_INCLUDE,
  });
}

export async function getSellerSalesSummary(sellerId: string, range: ReportRange) {
  const start = rangeStart(range);
  const result = await prisma.sellerOrder.aggregate({
    where: { sellerId, ...(start ? { order: { createdAt: { gte: start } } } : {}) },
    _count: true,
    _sum: { subtotal: true, commissionAmount: true, payoutAmount: true },
  });
  return {
    orderCount: result._count,
    totalSubtotal: result._sum.subtotal ?? 0,
    totalCommission: result._sum.commissionAmount ?? 0,
    totalPayout: result._sum.payoutAmount ?? 0,
  };
}

export function getSellerPayoutHistoryRows(sellerId: string) {
  return prisma.sellerOrder.findMany({
    where: { sellerId, status: "delivered" },
    orderBy: { deliveredAt: "desc" },
    include: { order: { select: { orderNumber: true } } },
  });
}

export async function getPlatformRevenueBySeller(range: ReportRange) {
  const start = rangeStart(range);
  const dateFilter = start ? { order: { createdAt: { gte: start } } } : {};

  const grouped = await prisma.sellerOrder.groupBy({
    by: ["sellerId"],
    where: dateFilter,
    _count: true,
    _sum: { subtotal: true, commissionAmount: true, payoutAmount: true },
  });

  const sellers = await prisma.sellerProfile.findMany({
    where: { id: { in: grouped.map((g) => g.sellerId) } },
    select: { id: true, storeName: true },
  });
  const storeNameById = new Map(sellers.map((s) => [s.id, s.storeName]));

  const rows = grouped.map((g) => ({
    sellerId: g.sellerId,
    storeName: storeNameById.get(g.sellerId) ?? "(unknown seller)",
    orderCount: g._count,
    totalSubtotal: g._sum.subtotal ?? 0,
    totalCommission: g._sum.commissionAmount ?? 0,
    totalPayout: g._sum.payoutAmount ?? 0,
  }));

  const totals = rows.reduce(
    (acc, r) => ({
      orderCount: acc.orderCount + r.orderCount,
      totalSubtotal: acc.totalSubtotal + Number(r.totalSubtotal),
      totalCommission: acc.totalCommission + Number(r.totalCommission),
      totalPayout: acc.totalPayout + Number(r.totalPayout),
    }),
    { orderCount: 0, totalSubtotal: 0, totalCommission: 0, totalPayout: 0 }
  );

  return { rows, totals };
}

export async function getSellerPerformanceRows() {
  const sellers = await prisma.sellerProfile.findMany({
    select: { id: true, storeName: true, status: true },
  });

  return Promise.all(
    sellers.map(async (seller) => {
      const [productCount, orderAgg, reviewAgg, cancelledOrReturnedCount] = await Promise.all([
        prisma.product.count({ where: { sellerId: seller.id } }),
        prisma.sellerOrder.aggregate({
          where: { sellerId: seller.id },
          _count: true,
          _sum: { subtotal: true },
        }),
        prisma.review.aggregate({
          where: { status: "approved", product: { sellerId: seller.id } },
          _avg: { rating: true },
          _count: true,
        }),
        prisma.sellerOrder.count({
          where: { sellerId: seller.id, status: { in: ["cancelled", "returned"] } },
        }),
      ]);

      return {
        storeName: seller.storeName,
        status: seller.status,
        productCount,
        orderCount: orderAgg._count,
        totalRevenue: orderAgg._sum.subtotal ?? 0,
        averageRating: reviewAgg._avg.rating,
        reviewCount: reviewAgg._count,
        cancelledOrReturnedCount,
      };
    })
  );
}
