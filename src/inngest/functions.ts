import { inngest } from "@/lib/inngest";
import { getImportBatchById } from "@/server/data/product-import";
import { processImportRows } from "@/server/services/product-import-service";
import { releaseSellerPayouts } from "@/server/services/payout-service";
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
