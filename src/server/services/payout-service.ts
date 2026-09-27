import "server-only";
import { stripe } from "@/lib/stripe";
import {
  listPayoutEligibleSellerIds,
  getPayoutEligibleOrdersForSeller,
  markSellerOrdersPaidOut,
} from "@/server/data/seller-orders";
import { getSellerProfileWithUserById } from "@/server/data/seller-profiles";
import {
  createPayout,
  markPayoutPaid,
  markPayoutFailed,
  listPayoutsForSeller,
  listPayoutsForAdmin,
} from "@/server/data/payouts";
import { createAuditLog } from "@/server/data/audit-log";
import { queueEmail } from "@/lib/email";
import { notifyUser } from "@/server/services/notification-service";
import { formatPrice } from "@/lib/format";
import { splitPage } from "@/lib/pagination";

// The spec's "delaying payout until the return window closes" fraud mitigation, made concrete:
// no actual return-window expiry exists anywhere else in the app (a buyer can request a return
// at any time after delivery), so this is the payout side's own hold instead.
const PAYOUT_ELIGIBILITY_DELAY_DAYS = 14;

export type ReleaseSellerPayoutsSummary = { processed: number; succeeded: number; failed: number };

/**
 * One Stripe transfer per seller per run, not per order — see the Payout model's doc comment in
 * schema.prisma. Sellers are processed sequentially and independently: one seller's Stripe
 * failure creates a `status: "failed"` Payout row (audited) and leaves their orders untouched
 * (`payoutAt` stays null, so they're automatically retried on the next run) rather than aborting
 * the whole batch.
 */
export async function releaseSellerPayouts(actorUserId: string | null = null): Promise<ReleaseSellerPayoutsSummary> {
  const cutoff = new Date(Date.now() - PAYOUT_ELIGIBILITY_DELAY_DAYS * 24 * 60 * 60 * 1000);
  const sellerIds = await listPayoutEligibleSellerIds(cutoff);

  const summary: ReleaseSellerPayoutsSummary = { processed: 0, succeeded: 0, failed: 0 };

  for (const sellerId of sellerIds) {
    summary.processed += 1;

    const orders = await getPayoutEligibleOrdersForSeller(sellerId, cutoff);
    if (orders.length === 0) continue;

    const amount = orders.reduce((sum, o) => sum + Number(o.payoutAmount), 0);
    const deliveredDates = orders.map((o) => o.deliveredAt!.getTime());
    const periodStart = new Date(Math.min(...deliveredDates));
    const periodEnd = new Date(Math.max(...deliveredDates));

    const payout = await createPayout({ sellerId, periodStart, periodEnd, amount });

    const seller = await getSellerProfileWithUserById(sellerId);
    const destination = seller?.stripeConnectAccountId;

    if (!destination) {
      await markPayoutFailed(payout.id);
      await createAuditLog({
        actorUserId,
        action: "payout_failed",
        entityType: "Payout",
        entityId: payout.id,
        afterValue: { sellerId, amount: amount.toString(), reason: "no_stripe_account" },
      });
      summary.failed += 1;
      continue;
    }

    try {
      const transfer = await stripe.transfers.create(
        { amount: Math.round(amount * 100), currency: "ron", destination },
        { idempotencyKey: `payout_batch_${payout.id}` }
      );
      await markPayoutPaid(payout.id, transfer.id);
      await markSellerOrdersPaidOut(
        orders.map((o) => o.id),
        new Date()
      );
      await createAuditLog({
        actorUserId,
        action: "payout_released",
        entityType: "Payout",
        entityId: payout.id,
        afterValue: { sellerId, amount: amount.toString(), stripeTransferId: transfer.id },
      });
      if (seller) {
        const payoutTitle = "Payout processed";
        const payoutBody = `A payout of ${formatPrice(amount)} has been sent to your connected account.`;
        await queueEmail({
          to: seller.user.email,
          subject: payoutTitle,
          html: `<p>${payoutBody}</p>`,
          text: payoutBody,
        }).catch(() => {});
        await notifyUser({
          userId: seller.user.id,
          type: "payout_processed",
          title: payoutTitle,
          body: payoutBody,
          link: "/seller/payouts",
        }).catch(() => {});
      }
      summary.succeeded += 1;
    } catch {
      await markPayoutFailed(payout.id);
      await createAuditLog({
        actorUserId,
        action: "payout_failed",
        entityType: "Payout",
        entityId: payout.id,
        afterValue: { sellerId, amount: amount.toString(), reason: "stripe_transfer_failed" },
      });
      summary.failed += 1;
    }
  }

  return summary;
}

export async function getPayoutHistoryForSeller(sellerId: string, page?: number) {
  const rows = await listPayoutsForSeller(sellerId, { page });
  const { items: payouts, hasNextPage } = splitPage(rows);
  return { payouts, hasNextPage };
}

export async function getPayoutHistoryForAdmin(page?: number) {
  const rows = await listPayoutsForAdmin({ page });
  const { items: payouts, hasNextPage } = splitPage(rows);
  return { payouts, hasNextPage };
}
