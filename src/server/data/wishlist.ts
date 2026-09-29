import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

/** Race-free get-or-create, exploiting Wishlist.userId's uniqueness — same pattern as
 *  getOrCreateCartForBuyer in cart.ts. */
export function getOrCreateWishlistForBuyer(userId: string) {
  return prisma.wishlist.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

/** Idempotent by construction — the unique constraint on (wishlistId, productId) means a
 *  duplicate add is a silent no-op via upsert rather than a P2002 error. */
export async function addWishlistItem(userId: string, productId: string) {
  const wishlist = await getOrCreateWishlistForBuyer(userId);
  return prisma.wishlistItem.upsert({
    where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
    create: { wishlistId: wishlist.id, productId },
    update: {},
  });
}

export async function removeWishlistItem(userId: string, productId: string) {
  const wishlist = await getOrCreateWishlistForBuyer(userId);
  return prisma.wishlistItem.deleteMany({
    where: { wishlistId: wishlist.id, productId },
  });
}

export async function isProductWishlisted(userId: string, productId: string): Promise<boolean> {
  const item = await prisma.wishlistItem.findFirst({
    where: { wishlist: { userId }, productId },
    select: { id: true },
  });
  return !!item;
}

/** One aggregate for the header's wishlist badge — mirrors getCartItemCount in cart.ts. */
export async function getWishlistItemCount(userId: string): Promise<number> {
  return prisma.wishlistItem.count({ where: { wishlist: { userId } } });
}

/**
 * A wishlisted product may since have gone inactive/deleted-by-the-seller — included regardless
 * of status so the wishlist page can show it (clearly marked unavailable) rather than silently
 * dropping it, per release-2.md's acceptance criteria for this feature.
 */
export function listWishlistItemsForBuyer(userId: string, opts?: { page?: number }) {
  const page = opts?.page ?? 1;
  return prisma.wishlistItem.findMany({
    where: { wishlist: { userId } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE + 1,
    include: {
      product: {
        include: {
          variants: { orderBy: { price: "asc" }, take: 1 },
        },
      },
    },
  });
}

/**
 * Co-occurrence "customers also bought" — other products bought by buyers who also bought
 * `productId`, derived from real OrderItem history, not a recommendation engine. Only counts
 * paid orders (an unpaid/failed order isn't evidence of anything). Returns product ids ranked by
 * how many distinct buyers bought both, excluding the product itself.
 */
export async function listCoPurchasedProductIds(productId: string, limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ productId: string }[]>`
    SELECT pv2."productId" as "productId", COUNT(DISTINCT o."buyerId") as "buyerCount"
    FROM order_items oi1
    JOIN product_variants pv1 ON pv1.id = oi1."productVariantId"
    JOIN seller_orders so1 ON so1.id = oi1."sellerOrderId"
    JOIN orders o ON o.id = so1."orderId"
    JOIN seller_orders so2 ON so2."orderId" = o.id
    JOIN order_items oi2 ON oi2."sellerOrderId" = so2.id
    JOIN product_variants pv2 ON pv2.id = oi2."productVariantId"
    WHERE pv1."productId" = ${productId}
      AND pv2."productId" != ${productId}
      AND o.status = 'paid'
    GROUP BY pv2."productId"
    ORDER BY "buyerCount" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.productId);
}
