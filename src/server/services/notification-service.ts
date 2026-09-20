import "server-only";
import {
  createNotification,
  getUnreadNotificationCount,
  listNotificationsForUser,
  markNotificationsRead,
} from "@/server/data/notifications";
import type { NotificationType } from "@/generated/prisma/enums";
import { splitPage } from "@/lib/pagination";

/**
 * Callers append .catch(() => {}) themselves, mirroring sendEmail's exact usage convention at
 * every call site (a failed notification write must never fail the underlying action).
 */
export function notifyUser(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}) {
  return createNotification(input);
}

export function getUnreadCount(userId: string) {
  return getUnreadNotificationCount(userId);
}

/**
 * Fetches one page of notifications, then marks only those rows as read. Returns the pre-mark
 * rows (their original `read` values intact) so the page can still render unread styling for
 * this one view before the badge/state actually clears. Scoped to just this page's ids — not a
 * blanket "mark everything unread as read" — so viewing page 1 can never mark page 2's rows read
 * before they've actually been seen.
 */
export async function getNotifications(userId: string, page?: number) {
  const rows = await listNotificationsForUser(userId, { page });
  const { items: notifications, hasNextPage } = splitPage(rows);
  await markNotificationsRead(
    userId,
    notifications.filter((n) => !n.read).map((n) => n.id)
  );
  return { notifications, hasNextPage };
}
