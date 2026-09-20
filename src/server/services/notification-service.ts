import "server-only";
import {
  createNotification,
  getUnreadNotificationCount,
  listNotificationsForUser,
  markAllNotificationsRead,
} from "@/server/data/notifications";
import type { NotificationType } from "@/generated/prisma/enums";

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
 * Fetches recent notifications, then marks everything just fetched as read. Returns the
 * pre-mark rows (their original `read` values intact) so the page can still render unread
 * styling for this one view before the badge/state actually clears.
 */
export async function getNotifications(userId: string) {
  const notifications = await listNotificationsForUser(userId);
  await markAllNotificationsRead(userId);
  return notifications;
}
