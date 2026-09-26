import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { purgeOldNotifications } from "@/server/services/notification-service";
import { createBuyer } from "@test/helpers";

describe("purgeOldNotifications", () => {
  it("deletes read notifications older than 90 days", async () => {
    const buyer = await createBuyer();
    const old = await prisma.notification.create({
      data: { userId: buyer.id, type: "order_delivered", title: "Old", body: "Old", read: true },
    });
    await prisma.notification.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) },
    });

    const result = await purgeOldNotifications();

    expect(result.count).toBe(1);
    const gone = await prisma.notification.findUnique({ where: { id: old.id } });
    expect(gone).toBeNull();
  });

  it("keeps unread notifications regardless of age", async () => {
    const buyer = await createBuyer();
    const old = await prisma.notification.create({
      data: { userId: buyer.id, type: "order_delivered", title: "Old", body: "Old", read: false },
    });
    await prisma.notification.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
    });

    const result = await purgeOldNotifications();

    expect(result.count).toBe(0);
    const stillThere = await prisma.notification.findUnique({ where: { id: old.id } });
    expect(stillThere).not.toBeNull();
  });

  it("keeps read notifications younger than 90 days", async () => {
    const buyer = await createBuyer();
    const recent = await prisma.notification.create({
      data: { userId: buyer.id, type: "order_delivered", title: "Recent", body: "Recent", read: true },
    });

    const result = await purgeOldNotifications();

    expect(result.count).toBe(0);
    const stillThere = await prisma.notification.findUnique({ where: { id: recent.id } });
    expect(stillThere).not.toBeNull();
  });
});
