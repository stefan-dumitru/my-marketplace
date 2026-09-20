import { inngest } from "@/lib/inngest";
import { getImportBatchById } from "@/server/data/product-import";
import { processImportRows } from "@/server/services/product-import-service";
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
