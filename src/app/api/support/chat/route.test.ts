import { describe, expect, it, vi, type Mock } from "vitest";
import { auth } from "@/lib/auth";
import { GET } from "@/app/api/support/chat/route";
import { prisma } from "@/lib/prisma";
import { sendAdminSupportReply, sendUserSupportMessage } from "@/server/services/support-service";
import { createAdmin, createBuyer, sessionFor } from "@test/helpers";

vi.mock("@/lib/email", () => ({ queueEmail: vi.fn(async () => ({ ids: [] })) }));

const authMock = auth as unknown as Mock;
const call = (qs = "") => GET(new Request(`http://localhost/api/support/chat${qs}`));

describe("GET /api/support/chat", () => {
  it("rejects anonymous visitors", async () => {
    authMock.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it("returns only the caller's own messages, never cached", async () => {
    const alice = await createBuyer();
    const bob = await createBuyer();
    await sendUserSupportMessage(alice.id, { body: "alice private" });
    await sendUserSupportMessage(bob.id, { body: "bob private" });

    authMock.mockResolvedValue(sessionFor({ id: alice.id, role: "buyer" }));
    const res = await call();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(json.messages.map((m: { body: string }) => m.body)).toEqual(["alice private"]);
  });

  it("returns nothing for a user with no conversation", async () => {
    const user = await createBuyer();
    authMock.mockResolvedValue(sessionFor({ id: user.id, role: "buyer" }));

    const json = await (await call()).json();

    expect(json).toEqual({ conversationId: null, messages: [] });
  });

  it("filters by the `after` timestamp and ignores an invalid one", async () => {
    const user = await createBuyer();
    const first = await sendUserSupportMessage(user.id, { body: "first" });
    if (!first.ok) throw new Error("setup failed");
    await new Promise((r) => setTimeout(r, 5));
    await sendUserSupportMessage(user.id, { body: "second" });
    authMock.mockResolvedValue(sessionFor({ id: user.id, role: "buyer" }));

    const after = await (await call(`?after=${encodeURIComponent(first.message.createdAt.toISOString())}`)).json();
    const invalid = await (await call("?after=not-a-date")).json();

    expect(after.messages.map((m: { body: string }) => m.body)).toEqual(["second"]);
    expect(invalid.messages).toHaveLength(2);
  });

  it("peek reports unread admin replies without marking them read; a normal read does", async () => {
    const user = await createBuyer();
    const admin = await createAdmin();
    await sendUserSupportMessage(user.id, { body: "help" });
    const convo = await prisma.supportConversation.findFirstOrThrow({ where: { userId: user.id } });
    await sendAdminSupportReply(admin.id, convo.id, { body: "on it" });
    authMock.mockResolvedValue(sessionFor({ id: user.id, role: "buyer" }));

    expect(await (await call("?peek=1")).json()).toEqual({ unread: true });
    expect(await (await call("?peek=1")).json()).toEqual({ unread: true });

    await call();
    expect(await (await call("?peek=1")).json()).toEqual({ unread: false });
  });
});
