import "server-only";
import {
  ensureProductsIndex,
  getProductsIndex,
  isSearchConfigured,
  type ProductSearchDocument,
} from "@/lib/search";
import type { SearchSyncTarget } from "@/lib/search-sync";
import {
  getCategoryNamesBySlugs,
  listProductIdsByCategory,
  listProductIdsBySeller,
  listProductIdsPage,
  loadSearchDocuments,
} from "@/server/data/search-documents";

const REINDEX_BATCH_SIZE = 500;

/** Brings the index in line with Postgres for these products: upserts the visible ones, deletes
 * the rest. Idempotent, so a retried or duplicated sync event is harmless. */
export async function syncProductsToIndex(productIds: string[]) {
  if (!isSearchConfigured() || productIds.length === 0) return { upserted: 0, removed: 0 };

  const { documents, removedIds } = await loadSearchDocuments(productIds);
  const index = getProductsIndex();
  if (documents.length > 0) await index.addDocuments(documents).waitTask();
  if (removedIds.length > 0) await index.deleteDocuments(removedIds).waitTask();
  return { upserted: documents.length, removed: removedIds.length };
}

export async function syncTarget(target: SearchSyncTarget) {
  const ids = new Set(target.productIds ?? []);
  if (target.sellerId) (await listProductIdsBySeller(target.sellerId)).forEach((id) => ids.add(id));
  if (target.categoryId) (await listProductIdsByCategory(target.categoryId)).forEach((id) => ids.add(id));
  return syncProductsToIndex([...ids]);
}

/** Full rebuild — the initial backfill and the nightly drift safety net. Rebuilds from scratch
 * (clears first) so documents for hard-deleted products can't linger. */
export async function reindexAllProducts() {
  if (!isSearchConfigured()) return { upserted: 0 };
  await ensureProductsIndex();
  await getProductsIndex().deleteAllDocuments().waitTask();

  let upserted = 0;
  let afterId: string | null = null;
  for (;;) {
    const ids = await listProductIdsPage(afterId, REINDEX_BATCH_SIZE);
    if (ids.length === 0) break;
    const { documents } = await loadSearchDocuments(ids);
    if (documents.length > 0) await getProductsIndex().addDocuments(documents).waitTask();
    upserted += documents.length;
    afterId = ids[ids.length - 1];
  }
  return { upserted };
}

// --- Querying ---

/** Meilisearch filter values are interpolated into a filter *expression*, so anything that comes
 * from a URL goes through this — quoted, with quotes/backslashes escaped — rather than being
 * trusted. Numbers are re-coerced separately below. */
function quote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export type SearchFilters = {
  categorySlug?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
};

function buildFilter(f: SearchFilters): string[] {
  const clauses: string[] = [];
  if (f.categorySlug) clauses.push(`category = ${quote(f.categorySlug)}`);
  if (f.brand) clauses.push(`brand = ${quote(f.brand)}`);
  // A product matches a price band if its [minPrice, maxPrice] range overlaps the band. Exact for
  // single-variant products; for multi-variant products with a price gap it can include a product
  // none of whose variants is *exactly* inside the band — acceptable for a browse filter.
  if (f.minPrice !== undefined && Number.isFinite(f.minPrice)) clauses.push(`maxPrice >= ${Number(f.minPrice)}`);
  if (f.maxPrice !== undefined && Number.isFinite(f.maxPrice)) clauses.push(`minPrice <= ${Number(f.maxPrice)}`);
  if (f.minRating !== undefined && Number.isFinite(f.minRating)) clauses.push(`rating >= ${Number(f.minRating)}`);
  return clauses;
}

/** Ranked product ids for the results page. Throws if Meilisearch is unreachable — the caller
 * (listActiveProducts) catches that and falls back to the Postgres path. */
export async function searchProductIds(
  opts: { q: string; skip: number; take: number } & SearchFilters
): Promise<string[]> {
  const result = await getProductsIndex().search(opts.q, {
    filter: buildFilter(opts),
    offset: opts.skip,
    limit: opts.take,
    attributesToRetrieve: ["id"],
  });
  return result.hits.map((h) => h.id);
}

export type SearchSuggestions = {
  products: Pick<ProductSearchDocument, "id" | "slug" | "name" | "image" | "minPrice">[];
  categories: { slug: string; name: string }[];
  brands: string[];
};

const SUGGESTION_PRODUCTS = 6;
const SUGGESTION_CHIPS = { categories: 2, brands: 1 };

export async function suggestProducts(q: string): Promise<SearchSuggestions> {
  const result = await getProductsIndex().search(q, {
    limit: SUGGESTION_PRODUCTS,
    attributesToRetrieve: ["id", "slug", "name", "image", "minPrice"],
    facets: ["category", "brand"],
  });

  const top = (dist: Record<string, number> | undefined, n: number) =>
    Object.entries(dist ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([value]) => value);

  const categorySlugs = top(result.facetDistribution?.category, SUGGESTION_CHIPS.categories);
  const names = await getCategoryNamesBySlugs(categorySlugs);

  return {
    products: result.hits,
    categories: categorySlugs.flatMap((slug) => (names.has(slug) ? [{ slug, name: names.get(slug)! }] : [])),
    brands: top(result.facetDistribution?.brand, SUGGESTION_CHIPS.brands),
  };
}
