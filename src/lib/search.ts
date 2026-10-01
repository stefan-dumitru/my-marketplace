import "server-only";
import { Meilisearch, type Index } from "meilisearch";

export const PRODUCTS_INDEX = "products";

/** Shape of one Meilisearch document. Prisma stays the source of truth — this is a derived copy,
 * and anything price/stock-sensitive is re-read from Postgres before it's shown (see
 * hydrateProducts in server/data/products.ts), so a stale document can never reach checkout. */
export type ProductSearchDocument = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  description: string;
  category: string;
  categoryName: string;
  sellerName: string;
  image: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  rating: number;
  reviewCount: number;
  createdAt: number;
};

declare global {
  var __meili: Meilisearch | undefined;
}

/** Search is optional infrastructure: with no host configured every caller falls back to the
 * Postgres full-text/trigram path (and autocomplete simply hides). */
export function isSearchConfigured() {
  return Boolean(process.env.MEILISEARCH_HOST);
}

function getClient() {
  if (!globalThis.__meili) {
    globalThis.__meili = new Meilisearch({
      host: process.env.MEILISEARCH_HOST!,
      apiKey: process.env.MEILISEARCH_API_KEY,
      timeout: 2000,
    });
  }
  return globalThis.__meili;
}

export function getProductsIndex(): Index<ProductSearchDocument> {
  return getClient().index<ProductSearchDocument>(PRODUCTS_INDEX);
}

/** Idempotent — safe to call on every reindex. Settings are what make this a *typo-tolerant*
 * search rather than a plain keyword match: ranking order, which fields are searched (and in what
 * priority), and which are usable as filters/sorts. */
export async function ensureProductsIndex() {
  const client = getClient();
  try {
    await client.getIndex(PRODUCTS_INDEX);
  } catch {
    await client.createIndex(PRODUCTS_INDEX, { primaryKey: "id" }).waitTask();
  }
  await getProductsIndex()
    .updateSettings({
      searchableAttributes: ["name", "brand", "categoryName", "description"],
      filterableAttributes: ["category", "brand", "minPrice", "maxPrice", "rating"],
      sortableAttributes: ["minPrice", "rating", "createdAt"],
      // Default thresholds (5/9 chars) leave short words like "powr" untolerated; one notch lower
      // keeps typos forgiven on 4+ letter words without matching everything on 3-letter ones.
      typoTolerance: { minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
    })
    .waitTask();
}
