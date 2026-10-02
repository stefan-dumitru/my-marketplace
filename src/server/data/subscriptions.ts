import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { isEntitled, shouldReplaceStored } from "@/lib/subscription";

type Db = Prisma.TransactionClient | typeof prisma;

export function getSubscriptionByUserId(userId: string, db: Db = prisma) {
  return db.subscription.findUnique({ where: { userId } });
}

export function getUserBillingIdentity(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, stripeCustomerId: true } });
}

export function findUserByStripeCustomerId(stripeCustomerId: string) {
  return prisma.user.findUnique({ where: { stripeCustomerId }, select: { id: true, email: true } });
}

/** Race-safe: only sets the customer id if none is stored yet, so two concurrent first-time
 * subscribe clicks can never leave two different Stripe customers attached to one user. */
export async function setStripeCustomerIdIfUnset(userId: string, stripeCustomerId: string) {
  await prisma.user.updateMany({ where: { id: userId, stripeCustomerId: null }, data: { stripeCustomerId } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { stripeCustomerId: true } });
  return user.stripeCustomerId!;
}

export type SyncedSubscription = {
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
};

/**
 * Writes Stripe's current view of a subscription for a user. Returns what happened so the caller
 * can audit/notify on real transitions only (a redelivered event changes nothing → no double
 * notification), mirroring how the payment webhooks gate on their update's own count.
 */
export async function upsertSyncedSubscription(userId: string, incoming: SyncedSubscription) {
  return prisma.$transaction(async (tx) => {
    const stored = await tx.subscription.findUnique({ where: { userId } });
    if (!shouldReplaceStored(stored, incoming)) {
      return { applied: false as const, previousStatus: stored?.status ?? null, status: stored?.status ?? null };
    }
    await tx.subscription.upsert({
      where: { userId },
      create: { userId, ...incoming },
      update: incoming,
    });
    return { applied: true as const, previousStatus: stored?.status ?? null, status: incoming.status };
  });
}

export function markSubscriptionCanceled(userId: string) {
  return prisma.subscription.updateMany({ where: { userId }, data: { status: "canceled", cancelAtPeriodEnd: false } });
}

export async function isUserEntitledToFreeShipping(userId: string, db: Db = prisma) {
  return isEntitled(await getSubscriptionByUserId(userId, db));
}

export async function countActiveSubscribers() {
  return prisma.subscription.count({
    where: { status: { in: ["active", "trialing"] }, currentPeriodEnd: { gt: new Date() } },
  });
}
