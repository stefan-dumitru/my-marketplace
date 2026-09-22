import "server-only";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/enums";

export function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export function createUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  role?: UserRole;
}) {
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      phone: input.phone || null,
      role: input.role ?? "buyer",
    },
  });
}

export function markEmailVerified(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });
}

export const ANONYMIZED_NAME = "Deleted user";
const REDACTED = "[removed]";

function scrubSnapshot(snapshot: unknown) {
  const previous = (snapshot ?? {}) as Record<string, unknown>;
  const keep = (key: string) => (typeof previous[key] === "string" ? (previous[key] as string) : REDACTED);

  // Same key shape as checkout writes (see validations/checkout.ts) — three call sites cast this
  // JSON inline (orders/[id], seller/orders/[id], InvoiceDocument), so dropping keys would break
  // them. City/county/country are kept: region-level, not identifying on their own, and still
  // useful for fiscal/regional reporting on a retained order.
  return {
    recipientName: ANONYMIZED_NAME,
    line1: REDACTED,
    line2: "",
    city: keep("city"),
    county: keep("county"),
    postalCode: REDACTED,
    country: keep("country"),
    phone: REDACTED,
  };
}

/**
 * GDPR erasure, per data-model.md > User > Lifecycle: the row and its id survive (every
 * user-facing FK is ON DELETE RESTRICT, and Order/Payment are retained ~10 years for fiscal law),
 * but every PII field on or around it is overwritten.
 *
 * Deliberate exception to the one-query-per-function convention — same reasoning as
 * seller-profiles.ts's approveSellerProfileAndPromoteUser: this must be atomic across several
 * tables, and services aren't allowed to touch `prisma` directly. Returns null if the user doesn't
 * exist or was already anonymized, so a double-submit is a no-op.
 *
 * `scrubbedPasswordHash` is computed by the caller (account-service) rather than here, both to
 * keep bcrypt policy in the service layer and to keep a ~300ms hash out of the transaction.
 */
export async function anonymizeUserById(userId: string, scrubbedPasswordHash: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, anonymizedAt: null },
      select: { id: true, email: true },
    });
    if (!user) return null;

    const orders = await tx.order.findMany({
      where: { buyerId: userId },
      select: { id: true, shippingAddressSnapshot: true },
    });
    for (const order of orders) {
      await tx.order.update({
        where: { id: order.id },
        data: { shippingAddressSnapshot: scrubSnapshot(order.shippingAddressSnapshot) },
      });
    }

    // Leaf, non-financial rows — nothing retained depends on them.
    await tx.address.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    const cart = await tx.cart.findUnique({ where: { userId }, select: { id: true } });
    if (cart) {
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.delete({ where: { id: cart.id } });
    }
    // Both of these store the raw email in a column of their own.
    await tx.verificationToken.deleteMany({ where: { identifier: user.email } });
    await tx.rateLimitBucket.deleteMany({ where: { key: `login:${user.email}` } });

    return tx.user.update({
      where: { id: userId },
      data: {
        name: ANONYMIZED_NAME,
        // Derived from the immutable cuid so it can never collide with users_email_key; .invalid
        // is the RFC 2606 reserved TLD, so it's undeliverable and can never be registered.
        email: `deleted-${userId}@anonymized.invalid`,
        phone: null,
        passwordHash: scrubbedPasswordHash,
        anonymizedAt: new Date(),
        // Mandatory, not cosmetic: name/email are Auth.js JWT claims frozen at sign-in and never
        // refreshed from the DB, so without this bump a live session would keep rendering (and
        // printing onto invoice PDFs) the old PII until it expired — up to 30 days for a buyer.
        sessionVersion: { increment: 1 },
      },
    });
  });
}
