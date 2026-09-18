import "server-only";
import { prisma } from "@/lib/prisma";

export function getSellerProfileByUserId(userId: string) {
  return prisma.sellerProfile.findUnique({ where: { userId } });
}

export function getSellerProfileById(id: string) {
  return prisma.sellerProfile.findUnique({ where: { id } });
}

export function getSellerProfileByStoreSlug(storeSlug: string) {
  return prisma.sellerProfile.findUnique({ where: { storeSlug } });
}

export function createSellerApplication(input: {
  userId: string;
  storeName: string;
  storeSlug: string;
  description?: string;
  businessRegistrationNumber: string;
  logoUrl?: string;
}) {
  return prisma.sellerProfile.create({
    data: {
      userId: input.userId,
      storeName: input.storeName,
      storeSlug: input.storeSlug,
      description: input.description || null,
      businessRegistrationNumber: input.businessRegistrationNumber,
      logoUrl: input.logoUrl || null,
    },
  });
}

export function listPendingSellerApplications(opts?: { take?: number }) {
  return prisma.sellerProfile.findMany({
    where: { status: "pending" },
    orderBy: { appliedAt: "asc" },
    take: opts?.take ?? 50,
    include: { user: { select: { name: true, email: true } } },
  });
}

/**
 * Approves the seller application and promotes the user to role "seller" in one atomic
 * transaction. Bumping `sessionVersion` in the same operation is required — see
 * CLAUDE.md's Security Baseline — so the user's existing session is force-refreshed and picks
 * up the new role immediately instead of presenting a stale role until natural token expiry.
 *
 * This is a deliberate exception to the "one function, one query" data-access convention: the
 * atomicity requirement spans two tables, and services aren't allowed to touch `prisma` directly.
 */
export function approveSellerProfileAndPromoteUser(sellerProfileId: string, userId: string) {
  return prisma.$transaction([
    prisma.sellerProfile.update({
      where: { id: sellerProfileId },
      data: { status: "approved", approvedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { role: "seller", sessionVersion: { increment: 1 } },
    }),
  ]);
}

export function rejectSellerApplication(sellerProfileId: string) {
  return prisma.sellerProfile.update({
    where: { id: sellerProfileId },
    data: { status: "rejected" },
  });
}

export function listApprovedSellerProfiles() {
  return prisma.sellerProfile.findMany({
    where: { status: "approved" },
    orderBy: { storeName: "asc" },
    include: { user: { select: { name: true, email: true } } },
  });
}

export function listSuspendedSellerProfiles() {
  return prisma.sellerProfile.findMany({
    where: { status: "suspended" },
    orderBy: { storeName: "asc" },
    include: { user: { select: { name: true, email: true } } },
  });
}

/**
 * Suspends the seller AND deactivates their active listings in one transaction — matches
 * functional.md's "suspension deactivates their listings but preserves order history" exactly
 * (order/SellerOrder rows are never touched, only Product.status).
 */
export function suspendSellerProfileAndDeactivateProducts(sellerProfileId: string) {
  return prisma.$transaction([
    prisma.sellerProfile.update({
      where: { id: sellerProfileId },
      data: { status: "suspended", suspendedAt: new Date() },
    }),
    prisma.product.updateMany({
      where: { sellerId: sellerProfileId, status: "active" },
      data: { status: "inactive", deactivatedAt: new Date() },
    }),
  ]);
}

/**
 * Verify-then-update: only a currently-suspended profile can be reinstated. Deliberately does
 * NOT reactivate products — silently relisting a full catalog without re-review is riskier than
 * requiring the seller to manually reactivate each listing via the existing toggle.
 */
export async function reinstateSellerProfile(sellerProfileId: string) {
  const owned = await prisma.sellerProfile.findFirst({
    where: { id: sellerProfileId, status: "suspended" },
    select: { id: true },
  });
  if (!owned) return null;

  return prisma.sellerProfile.update({
    where: { id: sellerProfileId },
    data: { status: "approved", suspendedAt: null },
  });
}

export function setSellerCommissionOverride(sellerProfileId: string, rate: number | null) {
  return prisma.sellerProfile.update({
    where: { id: sellerProfileId },
    data: { commissionRateOverride: rate },
  });
}
