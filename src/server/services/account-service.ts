import "server-only";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { anonymizeUserById } from "@/server/data/users";
import { createAuditLog } from "@/server/data/audit-log";
import { BCRYPT_COST } from "@/server/services/auth-service";

export type DeleteAccountResult = { ok: true } | { ok: false; formError: string };

/**
 * GDPR erasure request from the data subject themselves. The row is never deleted — see
 * anonymizeUserById for why — so "deleting your account" means closing it and scrubbing the PII.
 */
export async function deleteOwnAccount(userId: string): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, anonymizedAt: true, sellerProfile: { select: { id: true } } },
  });
  if (!user) {
    return { ok: false, formError: "We couldn't find your account." };
  }
  // Idempotent: a double-submit (or a retry after a dropped response) is a no-op, not an error.
  if (user.anonymizedAt) {
    return { ok: true };
  }
  // Sellers carry fiscal and KYC obligations — payouts, invoices, and a businessRegistrationNumber
  // the spec keeps specifically to detect a business re-applying under a new account — so closing
  // one is a human decision, not self-service. data-model.md: SellerProfile is "never deleted".
  if (user.sellerProfile) {
    return {
      ok: false,
      formError: "Seller accounts can't be deleted here — please contact support.",
    };
  }

  // Hashed out here rather than in the data layer: keeps bcrypt policy in the service and a
  // ~300ms hash outside the transaction. Nobody ever learns this value, so no password matches.
  const scrubbedPasswordHash = await bcrypt.hash(randomUUID(), BCRYPT_COST);
  const anonymized = await anonymizeUserById(userId, scrubbedPasswordHash);
  if (!anonymized) {
    // Lost a race with a concurrent request that anonymized first — same end state either way.
    return { ok: true };
  }

  await createAuditLog({
    actorUserId: userId,
    action: "user_anonymized",
    entityType: "User",
    entityId: userId,
    // Deliberately records no old name/email/phone: audit entries are CSV-exported by
    // api/admin/reports/audit-log, so echoing the PII here would defeat the erasure.
    afterValue: {
      scrubbed: ["name", "email", "phone", "addresses", "notifications", "cart", "orderAddressSnapshots"],
    },
  });

  return { ok: true };
}
