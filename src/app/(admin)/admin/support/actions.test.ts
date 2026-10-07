import { describe, expect, it, vi, type Mock } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { closeConversationAction, sendAdminReplyAction } from "@/app/(admin)/admin/support/actions";
import { sendUserSupportMessage } from "@/server/services/support-service";
import { createAdmin, createBuyer, sessionFor } from "@test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ queueEmail: vi.fn(async () => ({ ids: [] })) }));

const authMock = auth as unknown as Mock;

async function openConversation() {
  const user = await createBuyer();
  await sendUserSupportMessage(user.id, { body: "help me" });
  return { user, convo: await prisma.supportConversation.findFirstOrThrow({ where: { userId: user.id } }) };
}

describe("admin support actions", () => {
  it("refuses replies from anonymous visitors and from the user themselves", async () => {
    const { user, convo } = await openConversation();

    authMock.mockResolvedValue(null);
    expect(await sendAdminReplyAction(convo.id, "hi")).toEqual({ ok: false, error: "Not authorized." });

    authMock.mockResolvedValue(sessionFor({ id: user.id, role: "buyer" }));
    expect(await sendAdminReplyAction(convo.id, "I am the admin")).toEqual({ ok: false, error: "Not authorized." });

    expect(await prisma.supportMessage.count({ where: { authorRole: "admin" } })).toBe(0);
  });

  it("lets an admin reply, recorded under the admin's id", async () => {
    const { convo } = await openConversation();
    const admin = await createAdmin();
    authMock.mockResolvedValue(sessionFor({ id: admin.id, role: "admin" }));

    const result = await sendAdminReplyAction(convo.id, "we are on it");

    expect(result.ok).toBe(true);
    const reply = await prisma.supportMessage.findFirstOrThrow({ where: { authorRole: "admin" } });
    expect(reply.authorId).toBe(admin.id);
    expect(reply.body).toBe("we are on it");
  });

  it("refuses to close a conversation unless the caller is an admin", async () => {
    const { user, convo } = await openConversation();
    authMock.mockResolvedValue(sessionFor({ id: user.id, role: "buyer" }));

    expect(await closeConversationAction(convo.id)).toEqual({ ok: false });
    expect((await prisma.supportConversation.findUniqueOrThrow({ where: { id: convo.id } })).status).toBe("open");
  });

  it("closes the conversation once, audits it and refreshes the pages", async () => {
    const { convo } = await openConversation();
    const admin = await createAdmin();
    authMock.mockResolvedValue(sessionFor({ id: admin.id, role: "admin" }));

    expect(await closeConversationAction(convo.id)).toEqual({ ok: true });
    expect(await closeConversationAction(convo.id)).toEqual({ ok: false });

    expect((await prisma.supportConversation.findUniqueOrThrow({ where: { id: convo.id } })).status).toBe("closed");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "support_conversation_closed" } });
    expect(log.actorUserId).toBe(admin.id);
    const { revalidatePath } = await import("next/cache");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/support");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/support/${convo.id}`);
  });
});
