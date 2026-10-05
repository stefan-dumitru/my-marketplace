import "server-only";
import { supportMessageSchema } from "@/lib/validations/support";
import { checkRateLimit } from "@/server/data/rate-limit";
import { createAuditLog } from "@/server/data/audit-log";
import { queueEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { splitPage } from "@/lib/pagination";
import {
  appendMessage,
  closeConversation,
  createConversationForUser,
  getConversationForAdmin,
  getOpenConversationForUser,
  listConversationsForAdmin,
  listMessagesForAdminConversation,
  listMessagesForUserConversation,
  markAdminRead,
  markUserRead,
  userHasUnreadSupportReply,
  countUnreadConversationsForAdmin,
} from "@/server/data/support";
import { getUserById } from "@/server/data/users";

const SEND_LIMIT = { limit: 20, windowSeconds: 60 };
// Don't email a user about every admin reply during a live back-and-forth: only when they
// haven't looked at the chat recently.
const EMAIL_QUIET_MS = 5 * 60 * 1000;

export type SupportMessageView = { id: string; authorRole: "user" | "admin"; body: string; createdAt: Date };

export type SendResult = { ok: true; message: SupportMessageView } | { ok: false; error: string };

export async function sendUserSupportMessage(userId: string, input: { body: string }): Promise<SendResult> {
  const parsed = supportMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message." };

  const limit = await checkRateLimit(`support:${userId}`, SEND_LIMIT);
  if (!limit.allowed) {
    return { ok: false, error: `You're sending messages too quickly. Try again in ${limit.retryAfterSeconds}s.` };
  }

  let conversation = await getOpenConversationForUser(userId);
  if (!conversation) {
    try {
      conversation = await createConversationForUser(userId);
    } catch {
      // Lost a race with another tab creating the one allowed open conversation.
      conversation = await getOpenConversationForUser(userId);
    }
  }
  if (!conversation) return { ok: false, error: "Couldn't start the chat. Please try again." };

  const message = await appendMessage({
    conversationId: conversation.id,
    authorId: userId,
    authorRole: "user",
    body: parsed.data.body,
  });
  return { ok: true, message };
}

/** The polling read: the user's open conversation, new messages since `after`, and marks them read. */
export async function getUserSupportChat(userId: string, after?: Date) {
  const conversation = await getOpenConversationForUser(userId);
  if (!conversation) return { conversationId: null, messages: [] as SupportMessageView[] };
  const messages = await listMessagesForUserConversation(userId, conversation.id, after);
  await markUserRead(userId, conversation.id);
  return { conversationId: conversation.id, messages };
}

export function hasUnreadSupportReply(userId: string) {
  return userHasUnreadSupportReply(userId);
}

// ---- Admin (callers must have verified the admin role) ----

export async function getAdminSupportInbox(opts: { status?: "open" | "closed"; page?: number }) {
  const rows = await listConversationsForAdmin(opts);
  const { items, hasNextPage } = splitPage(rows);
  return {
    hasNextPage,
    conversations: items.map((c) => {
      const last = c.messages[0];
      return {
        id: c.id,
        status: c.status,
        userName: c.user.name,
        userEmail: c.user.email,
        lastMessageAt: c.lastMessageAt,
        lastMessageBody: last?.body ?? "",
        unread: !c.adminLastReadAt || c.adminLastReadAt < c.lastMessageAt,
      };
    }),
  };
}

export function getAdminUnreadCount() {
  return countUnreadConversationsForAdmin();
}

export async function getAdminSupportThread(conversationId: string, after?: Date) {
  const conversation = await getConversationForAdmin(conversationId);
  if (!conversation) return null;
  const messages = await listMessagesForAdminConversation(conversationId, after);
  await markAdminRead(conversationId);
  return { conversation, messages };
}

export async function sendAdminSupportReply(
  adminId: string,
  conversationId: string,
  input: { body: string }
): Promise<SendResult> {
  const parsed = supportMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message." };

  const conversation = await getConversationForAdmin(conversationId);
  if (!conversation) return { ok: false, error: "Conversation not found." };
  if (conversation.status !== "open") return { ok: false, error: "This conversation is closed." };

  const message = await appendMessage({
    conversationId,
    authorId: adminId,
    authorRole: "admin",
    body: parsed.data.body,
  });

  const recentlyRead =
    conversation.userLastReadAt && Date.now() - conversation.userLastReadAt.getTime() < EMAIL_QUIET_MS;
  if (!recentlyRead) {
    const user = await getUserById(conversation.userId);
    if (user && !user.anonymizedAt) {
      const text = "You have a new reply from support. Open the chat on the site to read it and reply.";
      await queueEmail({
        to: user.email,
        subject: "New reply from support",
        html: `<p>${text}</p>`,
        text,
      }).catch((err) => logger.error({ err }, "Failed to queue support reply email"));
    }
  }
  return { ok: true, message };
}

export async function closeSupportConversation(adminId: string, conversationId: string) {
  const result = await closeConversation(conversationId);
  if (result.count === 0) return { ok: false as const };
  await createAuditLog({
    actorUserId: adminId,
    action: "support_conversation_closed",
    entityType: "SupportConversation",
    entityId: conversationId,
    beforeValue: { status: "open" },
    afterValue: { status: "closed" },
  });
  return { ok: true as const };
}
