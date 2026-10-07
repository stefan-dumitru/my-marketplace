import { describe, expect, it, vi, type Mock } from "vitest";
import { auth } from "@/lib/auth";
import { GET } from "@/app/api/admin/support/[id]/route";
import { prisma } from "@/lib/prisma";
import { sendUserSupportMessage } from "@/server/services/support-service";
import { createAdmin, createBuyer, sessionFor } from "@test/helpers";

vi.mock("@/lib/email", () => ({ queueEmail: vi.fn(async () => ({ ids: [] })) }));

const authMock = auth as unknown as Mock;
const call = (id: string, qs = "") =>
  GET(new Request(`http://localhost/api/admin/support/${id}${qs}`), { params: Promise.resolve({ id }) });

async function conversationWithMessage() {
  const user = await createBuyer();
  await sendUserSupportMessage(user.id, { body: "I need help" });
  return prisma.supportConversation.findFirstOrThrow({ where: { userId: user.id } });
}

describe("GET /api/admin/support/[id]", () => {
  it("rejects anonymous visitors with 401", async () => {
    const convo = await conversationWithMessage();
    authMock.mockResolvedValue(null);
    expect((await call(convo.id)).status).toBe(401);
  });

  it("rejects non-admins with 403, including the conversation's own owner", async () => {
    const convo = await conversationWithMessage();
    authMock.mockResolvedValue(sessionFor({ id: convo.userId, role: "buyer" }));
    expect((await call(convo.id)).status).toBe(403);
  });

  it("returns 404 for an unknown conversation", async () => {
    const admin = await createAdmin();
    authMock.mockResolvedValue(sessionFor({ id: admin.id, role: "admin" }));
    expect((await call("does-not-exist")).status).toBe(404);
  });

  it("returns status and messages to an admin, and marks the thread read", async () => {
    const convo = await conversationWithMessage();
    const admin = await createAdmin();
    authMock.mockResolvedValue(sessionFor({ id: admin.id, role: "admin" }));

    const res = await call(convo.id);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(json.status).toBe("open");
    expect(json.messages.map((m: { body: string }) => m.body)).toEqual(["I need help"]);
    const after = await prisma.supportConversation.findUniqueOrThrow({ where: { id: convo.id } });
    expect(after.adminLastReadAt).not.toBeNull();
  });
});
