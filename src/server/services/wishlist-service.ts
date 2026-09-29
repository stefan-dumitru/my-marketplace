import "server-only";
import { prisma } from "@/lib/prisma";
import { splitPage } from "@/lib/pagination";
import {
  addWishlistItem,
  getWishlistItemCount,
  isProductWishlisted,
  listCoPurchasedProductIds,
  listWishlistItemsForBuyer,
  removeWishlistItem,
} from "@/server/data/wishlist";

export type WishlistMutationResult = { ok: true } | { ok: false; formError: string };

async function productExists(productId: string): Promise<boolean> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  return !!product;
}

export async function toggleWishlistItem(
  userId: string,
  productId: string,
  action: "add" | "remove"
): Promise<WishlistMutationResult> {
  if (action === "add") {
    if (!(await productExists(productId))) {
      return { ok: false, formError: "This product no longer exists." };
    }
    await addWishlistItem(userId, productId);
    return { ok: true };
  }

  await removeWishlistItem(userId, productId);
  return { ok: true };
}

export { isProductWishlisted, getWishlistItemCount };

export async function listWishlistForBuyer(userId: string, page?: number) {
  const rows = await listWishlistItemsForBuyer(userId, { page });
  const { items, hasNextPage } = splitPage(rows);
  return { items, hasNextPage };
}

/** Hidden entirely (empty array) rather than shown empty — see release-2.md's cold-start note. */
export async function getCoPurchasedProducts(productId: string, limit = 6) {
  const ids = await listCoPurchasedProductIds(productId, limit);
  if (ids.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, status: "active" },
    include: { variants: { orderBy: { price: "asc" }, take: 1 }, seller: { select: { storeName: true } } },
  });

  // Preserve the co-occurrence ranking from the raw query — findMany's `in` doesn't guarantee
  // result order matches the id list order.
  const byId = new Map(products.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
}
