import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  closeSupportConversation,
  getAdminSupportInbox,
  getAdminSupportThread,
  getAdminUnreadCount,
  getUserSupportChat,
  hasUnreadSupportReply,
  sendAdminSupportReply,
  sendUserSupportMessage,
} from "@/server/services/support-service";
import { anonymizeUserById } from "@/server/data/users";
import { createAdmin, createBuyer } from "@test/helpers";
import * as email from "@/lib/email";

vi.mock("@/lib/email", () => ({ queueEmail: vi.fn(async () => ({ ids: [] })) }));

describe("support chat", () => {
  it("creates one open conversation per user and appends to it", async () => {
    const user = await createBuyer();

    const a = await sendUserSupportMessage(user.id, { body: "Hello" });
    const b = await sendUserSupportMessage(user.id, { body: "Anyone there?" });

    expect(a.ok && b.ok).toBe(true);
    const convos = await prisma.supportConversation.findMany({ where: { userId: user.id } });
    expect(convos).toHaveLength(1);
    expect(await prisma.supportMessage.count({ where: { conversationId: convos[0].id } })).toBe(2);
  });

  it("rejects empty and over-long messages", async () => {
    const user = await createBuyer();
    expect((await sendUserSupportMessage(user.id, { body: "   " })).ok).toBe(false);
    expect((await sendUserSupportMessage(user.id, { body: "x".repeat(2001) })).ok).toBe(false);
    expect(await prisma.supportConversation.count()).toBe(0);
  });

  it("rate-limits a user who floods the chat", async () => {
    const user = await createBuyer();
    let blocked = false;
    for (let i = 0; i < 25; i++) {
      const r = await sendUserSupportMessage(user.id, { body: `msg ${i}` });
      if (!r.ok) blocked = true;
    }
    expect(blocked).toBe(true);
  });

  it("only ever shows a user their own conversation", async () => {
    const alice = await createBuyer();
    const bob = await createBuyer();
    await sendUserSupportMessage(alice.id, { body: "alice secret" });

    const bobChat = await getUserSupportChat(bob.id);

    expect(bobChat.conversationId).toBeNull();
    expect(bobChat.messages).toEqual([]);
  });

  it("returns only messages after the given timestamp", async () => {
    const user = await createBuyer();
    const first = await sendUserSupportMessage(user.id, { body: "first" });
    if (!first.ok) throw new Error("setup failed");
    await new Promise((r) => setTimeout(r, 5));
    await sendUserSupportMessage(user.id, { body: "second" });

    const chat = await getUserSupportChat(user.id, first.message.createdAt);

    expect(chat.messages.map((m) => m.body)).toEqual(["second"]);
  });

  it("flags an admin reply as unread until the user reads the chat", async () => {
    const user = await createBuyer();
    const admin = await createAdmin();
    await sendUserSupportMessage(user.id, { body: "help" });
    const convo = await prisma.supportConversation.findFirstOrThrow({ where: { userId: user.id } });

    await sendAdminSupportReply(admin.id, convo.id, { body: "on it" });
    expect(await hasUnreadSupportReply(user.id)).toBe(true);

    await getUserSupportChat(user.id);
    expect(await hasUnreadSupportReply(user.id)).toBe(false);
  });

  it("shows unread conversations to admins until a thread is opened or answered", async () => {
    const user = await createBuyer();
    const admin = await createAdmin();
    await sendUserSupportMessage(user.id, { body: "help" });
    const convo = await prisma.supportConversation.findFirstOrThrow({ where: { userId: user.id } });

    expect(await getAdminUnreadCount()).toBe(1);
    const inbox = await getAdminSupportInbox({ status: "open" });
    expect(inbox.conversations[0].unread).toBe(true);

    await getAdminSupportThread(convo.id);
    expect(await getAdminUnreadCount()).toBe(0);

    await sendUserSupportMessage(user.id, { body: "still there?" });
    expect(await getAdminUnreadCount()).toBe(1);
    await sendAdminSupportReply(admin.id, convo.id, { body: "yes" });
    expect(await getAdminUnreadCount()).toBe(0);
  });

  it("emails the user about a reply only when they haven't looked recently", async () => {
    const user = await createBuyer();
    const admin = await createAdmin();
    await sendUserSupportMessage(user.id, { body: "help" });
    const convo = await prisma.supportConversation.findFirstOrThrow({ where: { userId: user.id } });

    // The user just sent a message, so they count as recently active: no email.
    await sendAdminSupportReply(admin.id, convo.id, { body: "reply 1" });
    expect(email.queueEmail).not.toHaveBeenCalled();

    await prisma.supportConversation.update({
      where: { id: convo.id },
      data: { userLastReadAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    await sendAdminSupportReply(admin.id, convo.id, { body: "reply 2" });
    expect(email.queueEmail).toHaveBeenCalledTimes(1);
  });

  it("closing a conversation stops replies, is audited, and the next user message starts a new one", async () => {
    const user = await createBuyer();
    const admin = await createAdmin();
    await sendUserSupportMessage(user.id, { body: "help" });
    const convo = await prisma.supportConversation.findFirstOrThrow({ where: { userId: user.id } });

    expect((await closeSupportConversation(admin.id, convo.id)).ok).toBe(true);
    expect((await closeSupportConversation(admin.id, convo.id)).ok).toBe(false);
    expect((await sendAdminSupportReply(admin.id, convo.id, { body: "late" })).ok).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "support_conversation_closed" } })).toBe(1);

    expect((await sendUserSupportMessage(user.id, { body: "new issue" })).ok).toBe(true);
    expect(await prisma.supportConversation.count({ where: { userId: user.id } })).toBe(2);
    expect(await prisma.supportConversation.count({ where: { userId: user.id, status: "open" } })).toBe(1);
  });

  it("deletes chat history when the account is anonymized", async () => {
    const user = await createBuyer();
    await sendUserSupportMessage(user.id, { body: "my phone is 0700 000 000" });

    await anonymizeUserById(user.id, "scrubbed-hash");

    expect(await prisma.supportConversation.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.supportMessage.count()).toBe(0);
  });
});
