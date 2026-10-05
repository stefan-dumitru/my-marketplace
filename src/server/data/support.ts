import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import type { SupportAuthorRole, SupportConversationStatus } from "@/generated/prisma/enums";

const MESSAGE_SELECT = { id: true, authorRole: true, body: true, createdAt: true } as const;

// ---- User-scoped: every function takes the caller's userId and injects it into the WHERE. ----

export function getOpenConversationForUser(userId: string) {
  return prisma.supportConversation.findFirst({ where: { userId, status: "open" } });
}

export function createConversationForUser(userId: string) {
  return prisma.supportConversation.create({ data: { userId } });
}

export function listMessagesForUserConversation(userId: string, conversationId: string, after?: Date) {
  return prisma.supportMessage.findMany({
    where: { conversationId, conversation: { userId }, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: MESSAGE_SELECT,
  });
}

export function markUserRead(userId: string, conversationId: string) {
  return prisma.supportConversation.updateMany({
    where: { id: conversationId, userId },
    data: { userLastReadAt: new Date() },
  });
}

/** True when the newest message in the user's open conversation is from an admin they haven't read. */
export async function userHasUnreadSupportReply(userId: string): Promise<boolean> {
  const convo = await prisma.supportConversation.findFirst({
    where: { userId, status: "open" },
    select: { id: true, userLastReadAt: true },
  });
  if (!convo) return false;
  return (
    (await prisma.supportMessage.count({
      where: {
        conversationId: convo.id,
        authorRole: "admin",
        ...(convo.userLastReadAt ? { createdAt: { gt: convo.userLastReadAt } } : {}),
      },
    })) > 0
  );
}

// ---- Shared write: callers have already authorized the author for this conversation. ----

export async function appendMessage(input: {
  conversationId: string;
  authorId: string;
  authorRole: SupportAuthorRole;
  body: string;
}) {
  // One timestamp for the message and both bookkeeping columns, so "author has read" never lands
  // a few ms before "last message" and shows their own message as unread.
  const now = new Date();
  const [message] = await prisma.$transaction([
    prisma.supportMessage.create({ data: { ...input, createdAt: now }, select: MESSAGE_SELECT }),
    prisma.supportConversation.update({
      where: { id: input.conversationId },
      data: {
        lastMessageAt: now,
        ...(input.authorRole === "user" ? { userLastReadAt: now } : { adminLastReadAt: now }),
      },
    }),
  ]);
  return message;
}

// ---- Admin: callers must have checked the admin role. ----

export function listConversationsForAdmin(opts: { status?: SupportConversationStatus; page?: number }) {
  const page = opts.page ?? 1;
  return prisma.supportConversation.findMany({
    where: opts.status ? { status: opts.status } : {},
    orderBy: { lastMessageAt: "desc" },
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE + 1,
    include: {
      user: { select: { name: true, email: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: MESSAGE_SELECT },
    },
  });
}

export function getConversationForAdmin(conversationId: string) {
  return prisma.supportConversation.findUnique({
    where: { id: conversationId },
    include: { user: { select: { name: true, email: true } } },
  });
}

export function listMessagesForAdminConversation(conversationId: string, after?: Date) {
  return prisma.supportMessage.findMany({
    where: { conversationId, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: MESSAGE_SELECT,
  });
}

export function markAdminRead(conversationId: string) {
  return prisma.supportConversation.update({ where: { id: conversationId }, data: { adminLastReadAt: new Date() } });
}

/** Conditional update so closing an already-closed conversation is a no-op, not an error. */
export function closeConversation(conversationId: string) {
  return prisma.supportConversation.updateMany({
    where: { id: conversationId, status: "open" },
    data: { status: "closed", closedAt: new Date() },
  });
}

/** Open conversations whose latest message came from a user the admins haven't read yet. */
export function countUnreadConversationsForAdmin() {
  return prisma.supportConversation.count({
    where: {
      status: "open",
      OR: [{ adminLastReadAt: null }, { adminLastReadAt: { lt: prisma.supportConversation.fields.lastMessageAt } }],
    },
  });
}
