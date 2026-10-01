import "server-only";
import { inngest } from "@/lib/inngest";
import { isSearchConfigured } from "@/lib/search";
import { logger } from "@/lib/logger";

export type SearchSyncTarget = {
  productIds?: string[];
  /** Resync every product of this seller (suspension hides them all at once). */
  sellerId?: string;
  /** Resync every product in this category (a rename changes each document's category text). */
  categoryId?: string;
};

/**
 * Best-effort: a search-index hiccup must never fail the write that triggered it — the nightly
 * full reindex (see reindexAllProductsFunction) is the safety net for anything dropped here.
 * No-op when search isn't configured.
 */
export async function enqueueSearchSync(target: SearchSyncTarget) {
  if (!isSearchConfigured()) return;
  try {
    await inngest.send({ name: "search/sync.requested", data: target });
  } catch (err) {
    logger.warn({ err, target }, "could not enqueue search index sync");
  }
}
