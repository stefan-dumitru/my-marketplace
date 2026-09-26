import { inngest } from "@/lib/inngest";
import { getImportBatchById } from "@/server/data/product-import";
import { processImportRows } from "@/server/services/product-import-service";
import { releaseSellerPayouts } from "@/server/services/payout-service";
import { notifySellerLowStock } from "@/server/services/seller-service";
import { purgeAbandonedCarts } from "@/server/services/cart-service";
import { purgeOldNotifications } from "@/server/services/notification-service";
import { computeDailySalesRollup, yesterdayUTC } from "@/server/services/sales-rollup-service";
import { sendEmail, type SendEmailInput } from "@/lib/email";
import type { ImportMode } from "@/generated/prisma/enums";

export const processProductImportFunction = inngest.createFunction(
  { id: "process-product-import", retries: 3, triggers: { event: "product-import/requested" } },
  async ({ event }) => {
    const { batchId, sellerId, actorUserId, sellerEmail, mode, rows } = event.data as {
      batchId: string;
      sellerId: string;
      actorUserId: string;
      sellerEmail: string;
      mode: ImportMode;
      rows: Record<string, string>[];
    };

    // Re-fetched rather than trusting the event payload's own notion of batch state — the
    // idempotency guard inside processImportRows needs the batch's *current* status, which may
    // have changed since this event was sent (e.g. on a redelivered/retried run).
    const batch = await getImportBatchById(batchId);
    if (!batch) return { skipped: true, reason: "batch not found" };

    return processImportRows(batch, sellerId, actorUserId, sellerEmail, mode, rows);
  }
);

// Weekly cron run + an admin-triggerable "run now" event, both calling the same batching logic
// (see payout-service.ts's releaseSellerPayouts for why it's one transfer per seller per run,
// not per order). 06:00 UTC every Monday — an arbitrary but reasonable default; nothing in the
// spec dictates an exact cadence.
export const releaseSellerPayoutsFunction = inngest.createFunction(
  { id: "release-seller-payouts", retries: 3, triggers: [{ cron: "0 6 * * 1" }, { event: "payouts/release.requested" }] },
  async ({ event }) => {
    const actorUserId = (event?.data as { actorUserId?: string } | undefined)?.actorUserId ?? null;
    return releaseSellerPayouts(actorUserId);
  }
);

// The actual delivery attempt behind queueEmail() (lib/email.ts) — every sendEmail call site in
// the app now enqueues this event instead of calling sendEmail directly, so a transient Resend
// failure gets Inngest's retry/backoff instead of a single best-effort attempt. See
// operations.md > External Integrations.
export const sendQueuedEmailFunction = inngest.createFunction(
  { id: "send-queued-email", retries: 3, triggers: { event: "email/send.requested" } },
  async ({ event }) => {
    await sendEmail(event.data as SendEmailInput);
  }
);

// Fired from orders.ts's createOrderFromCart the moment a ProductVariant's stock first crosses at
// or under LOW_STOCK_THRESHOLD — see that function's own atomic conditional-flag comment for why
// this fires at most once per dip, not once per sale.
export const sendLowStockAlertFunction = inngest.createFunction(
  { id: "send-low-stock-alert", retries: 3, triggers: { event: "product/stock-low" } },
  async ({ event }) => {
    const { sellerId, productId, productName, remaining } = event.data as {
      sellerId: string;
      productId: string;
      productName: string;
      remaining: number;
    };
    await notifySellerLowStock({ sellerId, productId, productName, remaining });
  }
);

// Housekeeping, not compliance-driven (see data-model.md > Data Retention) — 04:00 UTC, a quiet
// hour for this app's Europe/Bucharest-centered traffic.
export const purgeAbandonedCartsFunction = inngest.createFunction(
  { id: "purge-abandoned-carts", retries: 3, triggers: { cron: "0 4 * * *" } },
  async () => purgeAbandonedCarts()
);

export const purgeOldNotificationsFunction = inngest.createFunction(
  { id: "purge-old-notifications", retries: 3, triggers: { cron: "10 4 * * *" } },
  async () => purgeOldNotifications()
);

// Runs for "yesterday" (the last fully completed day) rather than "today," which is still in
// progress and would give an incomplete total — see sales-rollup-service.ts's doc comment.
export const computeDailySalesRollupFunction = inngest.createFunction(
  { id: "compute-daily-sales-rollup", retries: 3, triggers: { cron: "0 1 * * *" } },
  async () => computeDailySalesRollup(yesterdayUTC())
);
