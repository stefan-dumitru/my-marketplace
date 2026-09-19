import "server-only";
import { prisma } from "@/lib/prisma";

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

  return prisma.product.update({
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
            data: { price: data.price, stockQty: data.stockQty },
          },
        },
      }),
    },
    include: { variants: true },
  });
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

  return prisma.product.update({
    where: { id: productId },
    data:
      status === "active"
        ? { status: "active", activatedAt: new Date() }
        : { status: "inactive", deactivatedAt: new Date() },
  });
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

export function listProductsForSeller(sellerId: string, opts?: { take?: number }) {
  return prisma.product.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    take: opts?.take ?? 50,
    include: { variants: true, category: { select: { name: true } } },
  });
}

export function listPendingProductsForAdmin(opts?: { take?: number }) {
  return prisma.product.findMany({
    where: { status: "pending_review" },
    orderBy: { createdAt: "asc" },
    take: opts?.take ?? 50,
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

  return prisma.product.update({
    where: { id: productId },
    data: status === "active" ? { status: "active", activatedAt: new Date() } : { status: "rejected" },
  });
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

/**
 * Ranked product ids for a free-text search, backed by Product.searchVector (a generated,
 * GIN-indexed tsvector column — see the "add_product_search_vector" migration). Category name is
 * matched via a live join rather than folded into the tsvector, since a generated column can't
 * depend on a joined table and a category rename would otherwise need its own sync step.
 *
 * Only raw SQL in this codebase — confined here, tagged-template parameterized (never
 * $queryRawUnsafe/string interpolation) per CLAUDE.md's no-raw-SQL-concatenation rule.
 */
async function searchActiveProductIds(opts: {
  q: string;
  categorySlug?: string;
  take: number;
}): Promise<string[]> {
  const categorySlug = opts.categorySlug ?? null;

  const ftsRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id
    FROM products p
    JOIN categories c ON c.id = p."categoryId"
    WHERE p.status = 'active'::"ProductStatus"
      AND (${categorySlug}::text IS NULL OR c.slug = ${categorySlug})
      AND (
        p."searchVector" @@ websearch_to_tsquery('simple', ${opts.q})
        OR c.name ILIKE ${'%' + opts.q + '%'}
      )
    ORDER BY ts_rank(p."searchVector", websearch_to_tsquery('simple', ${opts.q})) DESC NULLS LAST,
             p."createdAt" DESC
    LIMIT ${opts.take}
  `;
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
        AND ${opts.q} <% p.name
      ORDER BY word_similarity(${opts.q}, p.name) DESC
      LIMIT ${opts.take}
    `;
  });
  return trgmRows.map((r) => r.id);
}

export async function listActiveProducts(opts?: { take?: number; q?: string; categorySlug?: string }) {
  const take = opts?.take ?? 24;

  if (!opts?.q) {
    return prisma.product.findMany({
      where: {
        status: "active",
        ...(opts?.categorySlug ? { category: { slug: opts.categorySlug } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      include: ACTIVE_PRODUCT_INCLUDE,
    });
  }

  const ids = await searchActiveProductIds({ q: opts.q, categorySlug: opts.categorySlug, take });
  if (ids.length === 0) return [];

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

  return prisma.productVariant.create({ data: { ...data, productId } });
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

  return prisma.productVariant.update({ where: { id: variantId }, data });
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
  return deleted;
}

export function countVariantsForProduct(productId: string) {
  return prisma.productVariant.count({ where: { productId } });
}

export function countOrderItemsForVariant(variantId: string) {
  return prisma.orderItem.count({ where: { productVariantId: variantId } });
}
