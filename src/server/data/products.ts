import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, splitPage } from "@/lib/pagination";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { enqueueSearchSync } from "@/lib/search-sync";

/**
 * Creates a Product and its single default ProductVariant in one nested-write Prisma call —
 * atomic without needing an explicit transaction. `sellerId` is a required first parameter,
 * per CLAUDE.md's ownership-scoping rule (there is no code path that creates a product without
 * an owning seller baked into the call).
 */
export function createProductForSeller(
  sellerId: string,
  input: {
    categoryId: string;
    sku: string;
    name: string;
    slug: string;
    description?: string;
    brand?: string;
    images: string[];
    price: number;
    stockQty: number;
  }
) {
  return prisma.product.create({
    data: {
      sellerId,
      categoryId: input.categoryId,
      sku: input.sku,
      name: input.name,
      slug: input.slug,
      description: input.description || null,
      brand: input.brand || null,
      images: input.images,
      status: "pending_review",
      variants: {
        create: [{ sku: input.sku, price: input.price, stockQty: input.stockQty }],
      },
    },
    include: { variants: true },
  });
}

export function getProductBySellerAndSku(sellerId: string, sku: string) {
  return prisma.product.findUnique({ where: { sellerId_sku: { sellerId, sku } } });
}

export function getProductByIdForSeller(sellerId: string, productId: string) {
  return prisma.product.findFirst({
    where: { id: productId, sellerId },
    include: { variants: true, category: { select: { name: true } } },
  });
}

/**
 * Verify-then-update: confirms the product belongs to this seller via a scoped read before
 * updating by primary key. (Not relying on Prisma's "extra filters in update()'s where" — not
 * confirmed against this project's Prisma version — this pattern is unambiguous either way.)
 *
 * Targets the product's first/default variant specifically (by id, fetched during the same
 * ownership read) rather than `variants.updateMany({ where: {} })` — now that a product can have
 * more than one variant (see product-variant-service.ts), blindly updating every variant with
 * this form's single price/stock field would silently corrupt the others. ProductForm's
 * price/stockQty fields mean "the default variant," not "every variant."
 */
export async function updateProductForSeller(
  sellerId: string,
  productId: string,
  data: {
    categoryId: string;
    name: string;
    description?: string;
    brand?: string;
    images: string[];
    price: number;
    stockQty: number;
  }
) {
  const owned = await prisma.product.findFirst({
    where: { id: productId, sellerId },
    select: { id: true, variants: { select: { id: true }, orderBy: { id: "asc" }, take: 1 } },
  });
  if (!owned) return null;
  const defaultVariantId = owned.variants[0]?.id;

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      categoryId: data.categoryId,
      name: data.name,
      description: data.description || null,
      brand: data.brand || null,
      images: data.images,
      ...(defaultVariantId && {
        variants: {
          update: {
            where: { id: defaultVariantId },
            data: {
              price: data.price,
              stockQty: data.stockQty,
              // A restock above the threshold re-arms next time stock dips again — see
              // ProductVariant.lowStockAlertedAt's doc comment in schema.prisma. Left untouched
              // (not set to null) if the seller re-saves the form while still low, so a future
              // dip past the threshold via a sale isn't required to re-trigger — it's already armed.
              ...(data.stockQty > LOW_STOCK_THRESHOLD && { lowStockAlertedAt: null }),
            },
          },
        },
      }),
    },
    include: { variants: true },
  });
  await enqueueSearchSync({ productIds: [productId] });
  return updated;
}

/**
 * Verify-then-update, narrower than updateProductForSeller: touches only the default variant's
 * price/stockQty, never the Product row's own fields (name/category/description/brand/images).
 * Used by attribute_update-mode CSV import, which never re-supplies — and must never overwrite —
 * anything beyond price/stock for an existing product.
 */
export async function updateProductAttributesForSeller(
  sellerId: string,
  productId: string,
  data: { price: number; stockQty: number }
) {
  const owned = await prisma.product.findFirst({
    where: { id: productId, sellerId },
    select: { variants: { select: { id: true }, orderBy: { id: "asc" }, take: 1 } },
  });
  const defaultVariantId = owned?.variants[0]?.id;
  if (!defaultVariantId) return null;

  const updated = await prisma.productVariant.update({
    where: { id: defaultVariantId },
    data: {
      price: data.price,
      stockQty: data.stockQty,
      ...(data.stockQty > LOW_STOCK_THRESHOLD && { lowStockAlertedAt: null }),
    },
  });
  await enqueueSearchSync({ productIds: [productId] });
  return updated;
}

export async function setProductStatusForSeller(
  sellerId: string,
  productId: string,
  status: "active" | "inactive"
) {
  const owned = await prisma.product.findFirst({
    where: { id: productId, sellerId },
    select: { id: true },
  });
  if (!owned) return null;

  const updated = await prisma.product.update({
    where: { id: productId },
    data:
      status === "active"
        ? { status: "active", activatedAt: new Date() }
        : { status: "inactive", deactivatedAt: new Date() },
  });
  await enqueueSearchSync({ productIds: [productId] });
  return updated;
}

/**
 * Returns the product regardless of status — deciding which statuses are publicly visible is a
 * business rule and belongs in the service layer (product-service.ts), not baked into this read.
 */
export function getProductBySlug(slug: string) {
  return prisma.product.findUnique({
    where: { slug },
    include: {
      variants: true,
      category: { select: { name: true, slug: true } },
      seller: { select: { storeName: true, storeSlug: true } },
    },
  });
}

export function listProductsForSeller(sellerId: string, opts?: { page?: number }) {
  const page = opts?.page ?? 1;
  return prisma.product.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE + 1,
    include: { variants: true, category: { select: { name: true } } },
  });
}

export function listPendingProductsForAdmin(opts?: { page?: number }) {
  const page = opts?.page ?? 1;
  return prisma.product.findMany({
    where: { status: "pending_review" },
    orderBy: { createdAt: "asc" },
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE + 1,
    include: {
      seller: { select: { storeName: true } },
      category: { select: { name: true } },
      variants: true,
    },
  });
}

/**
 * Verify-then-update: only a currently-pending_review product can be decided, so a double-click
 * (or two admins acting on the same queue) can't flip an already-decided product a second time.
 */
async function setPendingProductStatus(productId: string, status: "active" | "rejected") {
  const owned = await prisma.product.findFirst({
    where: { id: productId, status: "pending_review" },
    select: { id: true },
  });
  if (!owned) return null;

  const updated = await prisma.product.update({
    where: { id: productId },
    data: status === "active" ? { status: "active", activatedAt: new Date() } : { status: "rejected" },
  });
  await enqueueSearchSync({ productIds: [productId] });
  return updated;
}

export function approveProductForAdmin(productId: string) {
  return setPendingProductStatus(productId, "active");
}

export function rejectProductForAdmin(productId: string) {
  return setPendingProductStatus(productId, "rejected");
}

const ACTIVE_PRODUCT_INCLUDE = {
  variants: true,
  seller: { select: { storeName: true, storeSlug: true } },
  category: { select: { name: true, slug: true } },
} as const;

type ActiveProductFilters = {
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  /** Product ids whose approved-review average already clears the requested rating floor —
   * resolved once by the caller (see resolveRatingFilterProductIds) and intersected in here,
   * since "average of a relation" isn't something a single findMany where-clause can express. */
  ratingProductIds?: string[] | null;
};

/**
 * Ranked product ids for a free-text search, backed by Product.searchVector (a generated,
 * GIN-indexed tsvector column — see the "add_product_search_vector" migration). Category name is
 * matched via a live join rather than folded into the tsvector, since a generated column can't
 * depend on a joined table and a category rename would otherwise need its own sync step.
 *
 * Only raw SQL in this codebase — confined here, tagged-template parameterized (never
 * $queryRawUnsafe/string interpolation) per CLAUDE.md's no-raw-SQL-concatenation rule.
 */
async function searchActiveProductIds(
  opts: { q: string; skip: number; take: number } & ActiveProductFilters
): Promise<string[]> {
  const categorySlug = opts.categorySlug ?? null;
  const brand = opts.brand ?? null;
  const minPrice = opts.minPrice ?? null;
  const maxPrice = opts.maxPrice ?? null;
  // Prisma.$queryRaw binds a JS array as a real Postgres array parameter, so `= ANY(...)` works
  // directly — no need to hand-build an IN (...) list. A null filter (rating not requested) is
  // distinguished from an empty match list (rating requested, nothing qualifies) by this flag,
  // since `ANY('{}')` and "filter not applied" must not be conflated.
  const ratingFilterActive = opts.ratingProductIds != null;
  const ratingProductIds = opts.ratingProductIds ?? [];

  const ftsRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id
    FROM products p
    JOIN categories c ON c.id = p."categoryId"
    WHERE p.status = 'active'::"ProductStatus"
      AND (${categorySlug}::text IS NULL OR c.slug = ${categorySlug})
      AND (${brand}::text IS NULL OR p.brand = ${brand})
      AND (${ratingFilterActive}::boolean = false OR p.id = ANY(${ratingProductIds}::text[]))
      AND (
        ${minPrice}::numeric IS NULL AND ${maxPrice}::numeric IS NULL
        OR EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv."productId" = p.id
            AND (${minPrice}::numeric IS NULL OR pv.price >= ${minPrice}::numeric)
            AND (${maxPrice}::numeric IS NULL OR pv.price <= ${maxPrice}::numeric)
        )
      )
      AND (
        p."searchVector" @@ websearch_to_tsquery('simple', ${opts.q})
        OR c.name ILIKE ${'%' + opts.q + '%'}
      )
    ORDER BY ts_rank(p."searchVector", websearch_to_tsquery('simple', ${opts.q})) DESC NULLS LAST,
             p."createdAt" DESC
    OFFSET ${opts.skip}
    LIMIT ${opts.take}
  `;
  // Note: for a hand-edited/out-of-range page number (not reachable via the rendered Prev/Next
  // links, which only ever advance one page from a confirmed non-empty result), a page whose
  // offset falls past the full-text match count but within the trigram-fallback match count
  // could show trigram results where the previous page showed full-text ones. Accepted, flagged
  // edge case — only reachable by manually editing the URL, not through normal navigation.
  if (ftsRows.length > 0) return ftsRows.map((r) => r.id);

  // Trigram fallback — only runs when the full-text query found nothing, e.g. a misspelled
  // product name. Scoped to `name` only: the dominant typo case, not a blended multi-field match.
  //
  // word_similarity (the <% operator), not plain similarity/%: a short misspelled query word
  // compared against a whole multi-word product name via plain similarity() scores low purely
  // because the name has extra words diluting the ratio — word_similarity instead finds the
  // best-matching substring of the name, which is what "does this typo match part of the name"
  // actually means. SET LOCAL scopes the lowered threshold to this transaction only, so it can't
  // leak onto a reused pooled connection the way a bare set_limit()-style call would.
  const trgmRows = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL pg_trgm.word_similarity_threshold = 0.35`;
    return tx.$queryRaw<{ id: string }[]>`
      SELECT p.id
      FROM products p
      JOIN categories c ON c.id = p."categoryId"
      WHERE p.status = 'active'::"ProductStatus"
        AND (${categorySlug}::text IS NULL OR c.slug = ${categorySlug})
        AND (${brand}::text IS NULL OR p.brand = ${brand})
        AND (${ratingFilterActive}::boolean = false OR p.id = ANY(${ratingProductIds}::text[]))
        AND (
          ${minPrice}::numeric IS NULL AND ${maxPrice}::numeric IS NULL
          OR EXISTS (
            SELECT 1 FROM product_variants pv
            WHERE pv."productId" = p.id
              AND (${minPrice}::numeric IS NULL OR pv.price >= ${minPrice}::numeric)
              AND (${maxPrice}::numeric IS NULL OR pv.price <= ${maxPrice}::numeric)
          )
        )
        AND ${opts.q} <% p.name
      ORDER BY word_similarity(${opts.q}, p.name) DESC
      OFFSET ${opts.skip}
      LIMIT ${opts.take}
    `;
  });
  return trgmRows.map((r) => r.id);
}

const PRODUCTS_PAGE_SIZE = 24;

/** Distinct, non-null brand names across currently-active products, for the storefront filter dropdown. */
export async function listDistinctActiveBrands(): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { status: "active", brand: { not: null } },
    select: { brand: true },
    distinct: ["brand"],
    orderBy: { brand: "asc" },
  });
  return rows.map((r) => r.brand!);
}

/**
 * Resolves a minimum-average-rating filter to a concrete product id list, since neither a plain
 * findMany where-clause nor the raw search query can express "this relation's average clears a
 * threshold" directly. Only approved reviews count, matching getReviewSummaryForProduct's own
 * definition of a product's rating everywhere else in the app.
 */
async function resolveRatingFilterProductIds(minRating: number): Promise<string[]> {
  const grouped = await prisma.review.groupBy({
    by: ["productId"],
    where: { status: "approved" },
    _avg: { rating: true },
    having: { rating: { _avg: { gte: minRating } } },
  });
  return grouped.map((g) => g.productId);
}

/** Optional external ranking (Meilisearch). Resolves to ranked product ids, or null when the
 * external engine is unavailable — listActiveProducts then falls back to the Postgres query below.
 * Injected rather than imported so this data-access layer never depends on a service. */
export type ExternalRanker = (
  args: { q: string; skip: number; take: number; minRating?: number } & Omit<ActiveProductFilters, "ratingProductIds">
) => Promise<string[] | null>;

export async function listActiveProducts(
  opts?: { page?: number; q?: string; minRating?: number } & ActiveProductFilters,
  externalRanker?: ExternalRanker
) {
  const page = opts?.page ?? 1;
  const skip = (page - 1) * PRODUCTS_PAGE_SIZE;
  const take = PRODUCTS_PAGE_SIZE + 1;

  const ratingProductIds = opts?.minRating ? await resolveRatingFilterProductIds(opts.minRating) : null;
  // Short-circuit: nothing clears the rating bar, so neither query path below can match anything —
  // the raw-SQL path's `= ANY('{}')` would correctly return zero rows too, but skipping straight
  // to an empty result avoids a pointless query in the overwhelmingly common "no results" case.
  if (ratingProductIds !== null && ratingProductIds.length === 0) {
    return { products: [], hasNextPage: false };
  }

  const priceFilter =
    opts?.minPrice !== undefined || opts?.maxPrice !== undefined
      ? {
          some: {
            price: {
              ...(opts?.minPrice !== undefined && { gte: opts.minPrice }),
              ...(opts?.maxPrice !== undefined && { lte: opts.maxPrice }),
            },
          },
        }
      : undefined;

  if (!opts?.q) {
    const rows = await prisma.product.findMany({
      where: {
        status: "active",
        ...(opts?.categorySlug ? { category: { slug: opts.categorySlug } } : {}),
        ...(opts?.brand ? { brand: opts.brand } : {}),
        ...(priceFilter ? { variants: priceFilter } : {}),
        ...(ratingProductIds ? { id: { in: ratingProductIds } } : {}),
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: ACTIVE_PRODUCT_INCLUDE,
    });
    const split = splitPage(rows, PRODUCTS_PAGE_SIZE);
    return { products: split.items, hasNextPage: split.hasNextPage };
  }

  const externalIds = await externalRanker?.({
    q: opts.q,
    categorySlug: opts.categorySlug,
    brand: opts.brand,
    minPrice: opts.minPrice,
    maxPrice: opts.maxPrice,
    minRating: opts.minRating,
    skip,
    take,
  });
  const ids =
    externalIds ??
    (await searchActiveProductIds({
    q: opts.q,
    categorySlug: opts.categorySlug,
    brand: opts.brand,
    minPrice: opts.minPrice,
    maxPrice: opts.maxPrice,
    ratingProductIds,
    skip,
    take,
  }));
  const { items: pageIds, hasNextPage } = splitPage(ids, PRODUCTS_PAGE_SIZE);
  if (pageIds.length === 0) return { products: [], hasNextPage: false };

  const products = await hydrateProducts(pageIds);
  return { products, hasNextPage };
}

async function hydrateProducts(ids: string[]) {
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, status: "active" },
    include: ACTIVE_PRODUCT_INCLUDE,
  });

  // findMany's `id: { in }` doesn't preserve input order — re-sort into the rank order
  // searchActiveProductIds already computed, or the SQL-side ranking would be silently discarded.
  const byId = new Map(products.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)!).filter(Boolean);
}

// --- Variant CRUD ---
// Ownership scoping only — the "last variant" / "has order history" business rules live in
// product-variant-service.ts, same split already used elsewhere (e.g. category-service.ts's
// "can't be its own parent" check sits above updateCategory's plain verify-then-update).

export async function getVariantsForProduct(sellerId: string, productId: string) {
  const owned = await prisma.product.findFirst({ where: { id: productId, sellerId }, select: { id: true } });
  if (!owned) return null;

  return prisma.productVariant.findMany({ where: { productId }, orderBy: { id: "asc" } });
}

export async function getVariantForProduct(sellerId: string, productId: string, variantId: string) {
  const owned = await prisma.product.findFirst({ where: { id: productId, sellerId }, select: { id: true } });
  if (!owned) return null;

  return prisma.productVariant.findFirst({ where: { id: variantId, productId } });
}

export function getVariantBySellerAndSku(sellerId: string, sku: string) {
  return prisma.productVariant.findFirst({ where: { sku, product: { sellerId } } });
}

export async function createVariantForProduct(
  sellerId: string,
  productId: string,
  data: { sku: string; attributes: Record<string, string>; price: number; stockQty: number }
) {
  const owned = await prisma.product.findFirst({ where: { id: productId, sellerId }, select: { id: true } });
  if (!owned) return null;

  const created = await prisma.productVariant.create({ data: { ...data, productId } });
  await enqueueSearchSync({ productIds: [productId] });
  return created;
}

export async function updateVariantForProduct(
  sellerId: string,
  productId: string,
  variantId: string,
  data: { attributes: Record<string, string>; price: number; stockQty: number }
) {
  const owned = await prisma.productVariant.findFirst({
    where: { id: variantId, productId, product: { sellerId } },
    select: { id: true },
  });
  if (!owned) return null;

  const updated = await prisma.productVariant.update({ where: { id: variantId }, data });
  await enqueueSearchSync({ productIds: [productId] });
  return updated;
}

export async function deleteVariantForProduct(sellerId: string, productId: string, variantId: string) {
  const owned = await prisma.productVariant.findFirst({
    where: { id: variantId, productId, product: { sellerId } },
    select: { id: true },
  });
  if (!owned) return null;

  // Cart contents aren't a committed record like OrderItem, so removing a variant that's
  // sitting unpurchased in someone's cart should just clear it from those carts rather than
  // being blocked by the FK constraint.
  const [, deleted] = await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { productVariantId: variantId } }),
    prisma.productVariant.delete({ where: { id: variantId } }),
  ]);
  await enqueueSearchSync({ productIds: [productId] });
  return deleted;
}

export function countVariantsForProduct(productId: string) {
  return prisma.productVariant.count({ where: { productId } });
}

export function countOrderItemsForVariant(variantId: string) {
  return prisma.orderItem.count({ where: { productVariantId: variantId } });
}
