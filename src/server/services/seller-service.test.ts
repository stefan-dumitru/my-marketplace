import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  applyForSellerAccount,
  approveSellerApplication,
  rejectSellerApplication,
  suspendSeller,
  reinstateSeller,
  notifySellerLowStock,
} from "@/server/services/seller-service";
import { createBuyer, createApprovedSeller, createCategory, createActiveProduct } from "@test/helpers";

const APPLICATION_INPUT = {
  storeName: "My Shop",
  description: "",
  businessRegistrationNumber: "RO12345678",
};

describe("applyForSellerAccount", () => {
  it("creates a pending application", async () => {
    const buyer = await createBuyer();

    const result = await applyForSellerAccount(buyer.id, APPLICATION_INPUT, null);

    expect(result.ok).toBe(true);
    const profile = await prisma.sellerProfile.findUniqueOrThrow({ where: { userId: buyer.id } });
    expect(profile.status).toBe("pending");
    expect(profile.storeName).toBe("My Shop");
  });

  it("rejects a second application while pending", async () => {
    const buyer = await createBuyer();
    await applyForSellerAccount(buyer.id, APPLICATION_INPUT, null);

    const result = await applyForSellerAccount(buyer.id, { ...APPLICATION_INPUT, storeName: "Again" }, null);

    expect(result.ok).toBe(false);
    expect(await prisma.sellerProfile.count({ where: { userId: buyer.id } })).toBe(1);
  });

  it("rejects a second application while already approved", async () => {
    const { user } = await createApprovedSeller();

    const result = await applyForSellerAccount(user.id, APPLICATION_INPUT, null);

    expect(result.ok).toBe(false);
  });

  // Divergence from the reference suite, which resets a rejected applicant back to pending:
  // this app's existing-profile check (see applyForSellerAccount) blocks re-applying after
  // ANY prior status, rejected included — "Contact support for next steps," not self-service.
  // Testing the actual behavior, not the assumed one.
  it("blocks re-applying after a rejection too (no self-service reset)", async () => {
    const buyer = await createBuyer();
    await applyForSellerAccount(buyer.id, APPLICATION_INPUT, null);
    const profile = await prisma.sellerProfile.findUniqueOrThrow({ where: { userId: buyer.id } });
    await prisma.sellerProfile.update({ where: { id: profile.id }, data: { status: "rejected" } });

    const result = await applyForSellerAccount(buyer.id, { ...APPLICATION_INPUT, storeName: "Second Name" }, null);

    expect(result.ok).toBe(false);
    const stillOne = await prisma.sellerProfile.count({ where: { userId: buyer.id } });
    expect(stillOne).toBe(1);
  });
});

describe("approveSellerApplication", () => {
  it("approves and creates an audit log entry", async () => {
    const buyer = await createBuyer();
    const admin = await createBuyer();
    await applyForSellerAccount(buyer.id, APPLICATION_INPUT, null);
    const profile = await prisma.sellerProfile.findUniqueOrThrow({ where: { userId: buyer.id } });

    const result = await approveSellerApplication(profile.id, admin.id);

    expect(result.ok).toBe(true);
    const updated = await prisma.sellerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(updated.status).toBe("approved");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } });
    expect(user.role).toBe("seller");
    const log = await prisma.auditLog.findFirst({ where: { entityId: profile.id, action: "seller_approved" } });
    expect(log).not.toBeNull();
  });

  it("refuses to approve a non-pending application", async () => {
    const { profile } = await createApprovedSeller();
    const admin = await createBuyer();

    const result = await approveSellerApplication(profile.id, admin.id);

    expect(result.ok).toBe(false);
  });
});

describe("rejectSellerApplication", () => {
  it("rejects and creates an audit log entry", async () => {
    const buyer = await createBuyer();
    const admin = await createBuyer();
    await applyForSellerAccount(buyer.id, APPLICATION_INPUT, null);
    const profile = await prisma.sellerProfile.findUniqueOrThrow({ where: { userId: buyer.id } });

    const result = await rejectSellerApplication(profile.id, admin.id);

    expect(result.ok).toBe(true);
    const updated = await prisma.sellerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(updated.status).toBe("rejected");
    const log = await prisma.auditLog.findFirst({ where: { entityId: profile.id, action: "seller_rejected" } });
    expect(log).not.toBeNull();
  });
});

describe("suspendSeller", () => {
  it("deactivates every one of the seller's products and logs it", async () => {
    const { profile } = await createApprovedSeller();
    const admin = await createBuyer();
    const category = await createCategory();
    const productA = await createActiveProduct(profile.id, category.id, { name: "A" });
    const productB = await createActiveProduct(profile.id, category.id, { name: "B" });

    const result = await suspendSeller(profile.id, admin.id);

    expect(result.ok).toBe(true);
    const reloadedA = await prisma.product.findUniqueOrThrow({ where: { id: productA.id } });
    const reloadedB = await prisma.product.findUniqueOrThrow({ where: { id: productB.id } });
    expect(reloadedA.status).toBe("inactive");
    expect(reloadedB.status).toBe("inactive");
    const log = await prisma.auditLog.findFirst({ where: { entityId: profile.id, action: "seller_suspended" } });
    expect(log).not.toBeNull();
  });
});

describe("reinstateSeller", () => {
  it("restores approved status WITHOUT reactivating products (deliberate)", async () => {
    const { profile } = await createApprovedSeller();
    const admin = await createBuyer();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);
    await suspendSeller(profile.id, admin.id);

    const result = await reinstateSeller(profile.id, admin.id);

    expect(result.ok).toBe(true);
    const updatedProfile = await prisma.sellerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(updatedProfile.status).toBe("approved");
    const reloadedProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(reloadedProduct.status).toBe("inactive"); // not auto-reactivated — deliberate per seller-profiles.ts
    const logs = await prisma.auditLog.findMany({
      where: { entityId: profile.id, action: { in: ["seller_suspended", "seller_reinstated"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((l) => l.action)).toEqual(["seller_suspended", "seller_reinstated"]);
  });

  it("refuses to reinstate a seller that isn't suspended", async () => {
    const { profile } = await createApprovedSeller();
    const admin = await createBuyer();

    const result = await reinstateSeller(profile.id, admin.id);

    expect(result.ok).toBe(false);
  });
});

describe("notifySellerLowStock", () => {
  it("creates an in-app notification for the seller's own user account", async () => {
    const { profile, user } = await createApprovedSeller();

    await notifySellerLowStock({
      sellerId: profile.id,
      productId: "prod-1",
      productName: "Wireless Mouse",
      remaining: 3,
    });

    const notification = await prisma.notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(notification.type).toBe("low_stock_alert");
    expect(notification.body).toContain("Wireless Mouse");
    expect(notification.body).toContain("3");
  });

  it("is a no-op for a seller id that doesn't exist", async () => {
    await expect(
      notifySellerLowStock({ sellerId: "does-not-exist", productId: "prod-1", productName: "X", remaining: 1 })
    ).resolves.toBeUndefined();
  });
});
