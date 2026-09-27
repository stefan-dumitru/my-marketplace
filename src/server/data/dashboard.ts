import "server-only";
import { prisma } from "@/lib/prisma";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";

// Plain server-local Date arithmetic — no timezone library anywhere else in this codebase to
// match. In most deployments this means UTC, which can be off by a few hours around midnight
// relative to Romania's actual calendar day; acceptable imprecision for a dashboard stat.
function monthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
function dayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function getSellerDashboardStats(sellerId: string) {
  const [ordersThisMonth, pendingShipment, lowStockCount, pendingPayout] = await Promise.all([
    prisma.sellerOrder.count({ where: { sellerId, order: { createdAt: { gte: monthStart() } } } }),
    prisma.sellerOrder.count({ where: { sellerId, status: "confirmed" } }),
    prisma.product.count({
      where: { sellerId, status: "active", variants: { some: { stockQty: { lte: LOW_STOCK_THRESHOLD } } } },
    }),
    prisma.sellerOrder.aggregate({
      where: { sellerId, status: "delivered", payoutAt: null },
      _sum: { payoutAmount: true },
    }),
  ]);

  return {
    ordersThisMonth,
    pendingShipment,
    lowStockCount,
    pendingPayoutAmount: pendingPayout._sum.payoutAmount ?? 0,
  };
}

export async function getAdminDashboardStats() {
  const [gmv, activeSellers, pendingSellerApprovals, ordersToday, takenDownReviews] = await Promise.all([
    prisma.order.aggregate({
      where: { status: "paid", createdAt: { gte: monthStart() } },
      _sum: { totalAmount: true },
    }),
    prisma.sellerProfile.count({ where: { status: "approved" } }),
    prisma.sellerProfile.count({ where: { status: "pending" } }),
    prisma.order.count({ where: { createdAt: { gte: dayStart() } } }),
    // Reviews auto-approve on submission (see review-service.ts's submitReview) — there's no
    // pre-publish backlog to flag anymore, so this now tracks post-publish moderation instead.
    prisma.review.count({ where: { status: "rejected" } }),
  ]);

  return {
    gmvThisMonth: gmv._sum.totalAmount ?? 0,
    activeSellers,
    pendingSellerApprovals,
    ordersToday,
    takenDownReviews,
  };
}
