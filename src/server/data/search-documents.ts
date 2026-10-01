import "server-only";
import { prisma } from "@/lib/prisma";
import type { ProductSearchDocument } from "@/lib/search";

/**
 * Builds search documents for the given product ids straight from Postgres. Returns the documents
 * that belong in the index (active product, approved seller) plus the ids that don't — a deleted,
 * deactivated, rejected or suspended-seller product must be *removed* from the index, not just
 * skipped, or a stale copy would keep surfacing in suggestions.
 */
export async function loadSearchDocuments(productIds: string[]): Promise<{
  documents: ProductSearchDocument[];
  removedIds: string[];
}> {
  if (productIds.length === 0) return { documents: [], removedIds: [] };

  const [products, ratings] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        slug: true,
        name: true,
        brand: true,
        description: true,
        images: true,
        status: true,
        createdAt: true,
        category: { select: { name: true, slug: true } },
        seller: { select: { storeName: true, status: true } },
        variants: { select: { price: true } },
      },
    }),
    // Only approved reviews count toward a product's rating everywhere else in the app
    // (getReviewSummaryForProduct) — same definition here, or the rating filter would disagree
    // with the stars shown on the product page.
    prisma.review.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, status: "approved" },
      _avg: { rating: true },
      _count: true,
    }),
  ]);

  const ratingByProduct = new Map(ratings.map((r) => [r.productId, r]));
  const documents: ProductSearchDocument[] = [];

  for (const p of products) {
    if (p.status !== "active" || p.seller.status !== "approved") continue;

    const prices = p.variants.map((v) => Number(v.price));
    const rating = ratingByProduct.get(p.id);
    documents.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      description: p.description ?? "",
      category: p.category.slug,
      categoryName: p.category.name,
      sellerName: p.seller.storeName,
      image: p.images[0] ?? null,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      rating: rating?._avg.rating ? Number(rating._avg.rating) : 0,
      reviewCount: rating?._count ?? 0,
      createdAt: p.createdAt.getTime(),
    });
  }

  const visible = new Set(documents.map((d) => d.id));
  const removedIds = productIds.filter((id) => !visible.has(id));
  return { documents, removedIds };
}

export async function listProductIdsBySeller(sellerId: string) {
  const rows = await prisma.product.findMany({ where: { sellerId }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function listProductIdsByCategory(categoryId: string) {
  const rows = await prisma.product.findMany({ where: { categoryId }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Keyset-paginated so a full reindex never loads the whole catalog into memory at once. */
export async function listProductIdsPage(afterId: string | null, take: number) {
  const rows = await prisma.product.findMany({
    where: afterId ? { id: { gt: afterId } } : undefined,
    orderBy: { id: "asc" },
    take,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Display names for the category chips in autocomplete — one cheap query for ≤3 slugs. */
export async function getCategoryNamesBySlugs(slugs: string[]) {
  if (slugs.length === 0) return new Map<string, string>();
  const rows = await prisma.category.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, name: true },
  });
  return new Map(rows.map((r) => [r.slug, r.name]));
}
