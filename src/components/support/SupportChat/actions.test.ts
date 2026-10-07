import { describe, expect, it, type Mock } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSupportMessageAction } from "@/components/support/SupportChat/actions";
import { createBuyer, sessionFor } from "@test/helpers";

const authMock = auth as unknown as Mock;

describe("sendSupportMessageAction", () => {
  it("asks anonymous visitors to log in and stores nothing", async () => {
    authMock.mockResolvedValue(null);

    const result = await sendSupportMessageAction("hello");

    expect(result).toEqual({ ok: false, error: "Please log in to chat with support." });
    expect(await prisma.supportMessage.count()).toBe(0);
  });

  it("stores the message against the logged-in user, not anyone else", async () => {
    const user = await createBuyer();
    const other = await createBuyer();
    authMock.mockResolvedValue(sessionFor({ id: user.id, role: "buyer" }));

    const result = await sendSupportMessageAction("my order is late");

    expect(result.ok).toBe(true);
    const convo = await prisma.supportConversation.findFirstOrThrow({ include: { messages: true } });
    expect(convo.userId).toBe(user.id);
    expect(convo.userId).not.toBe(other.id);
    expect(convo.messages.map((m) => m.body)).toEqual(["my order is late"]);
    expect(convo.messages[0].authorRole).toBe("user");
  });

  it("returns validation errors instead of throwing", async () => {
    const user = await createBuyer();
    authMock.mockResolvedValue(sessionFor({ id: user.id, role: "buyer" }));

    const result = await sendSupportMessageAction("   ");

    expect(result.ok).toBe(false);
    expect(await prisma.supportConversation.count()).toBe(0);
  });
});
