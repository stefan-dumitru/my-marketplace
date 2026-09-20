import "server-only";
import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@/generated/prisma/enums";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

export function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}) {
  return prisma.notification.create({ data: input });
}

/** One cheap count for the header's bell badge — mirrors getCartItemCount's shape. */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}

export function listNotificationsForUser(userId: string, opts?: { page?: number }) {
  const page = opts?.page ?? 1;
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE + 1,
  });
}

export function markNotificationsRead(userId: string, ids: string[]) {
  return prisma.notification.updateMany({
    where: { userId, id: { in: ids }, read: false },
    data: { read: true },
  });
}
