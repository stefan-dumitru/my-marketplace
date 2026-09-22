import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

export function createPayout(data: {
  sellerId: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
}) {
  return prisma.payout.create({ data: { ...data, status: "pending" } });
}

export function markPayoutPaid(payoutId: string, stripeTransferId: string) {
  return prisma.payout.update({
    where: { id: payoutId },
    data: { status: "paid", paidAt: new Date(), stripeTransferId },
  });
}

export function markPayoutFailed(payoutId: string) {
  return prisma.payout.update({
    where: { id: payoutId },
    data: { status: "failed" },
  });
}

export function listPayoutsForSeller(sellerId: string, opts?: { page?: number }) {
  const page = opts?.page ?? 1;
  return prisma.payout.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE + 1,
  });
}

export function listPayoutsForAdmin(opts?: { page?: number }) {
  const page = opts?.page ?? 1;
  return prisma.payout.findMany({
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE + 1,
    include: { seller: { select: { storeName: true } } },
  });
}
