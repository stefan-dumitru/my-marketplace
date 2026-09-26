import "server-only";
import { prisma } from "@/lib/prisma";

/** Race-free get-or-create, exploiting Cart.userId's uniqueness. No guest cart — see the plan. */
export function getOrCreateCartForBuyer(userId: string) {
  return prisma.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

/**
 * One query joining variant → product → category/seller, used by both the cart page and
 * checkout (each fetches this fresh on its own request — no cross-page caching).
 */
export async function getCartWithItems(userId: string) {
  const cart = await getOrCreateCartForBuyer(userId);
  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    take: 100,
    include: {
      productVariant: {
        include: {
          product: {
            include: {
              category: { select: { name: true } },
              seller: {
                select: {
                  id: true,
                  storeName: true,
                  storeSlug: true,
                },
              },
            },
          },
        },
      },
    },
  });
  return { cart, items };
}

export function upsertCartItemQuantity(cartId: string, productVariantId: string, quantity: number) {
  return prisma.cartItem.upsert({
    where: { cartId_productVariantId: { cartId, productVariantId } },
    create: { cartId, productVariantId, quantity },
    update: { quantity },
  });
}

export async function updateCartItemQuantityForBuyer(
  cartId: string,
  cartItemId: string,
  quantity: number
) {
  const owned = await prisma.cartItem.findFirst({
    where: { id: cartItemId, cartId },
    select: { id: true },
  });
  if (!owned) return null;
  return prisma.cartItem.update({ where: { id: cartItemId }, data: { quantity } });
}

export async function removeCartItemForBuyer(cartId: string, cartItemId: string) {
  const owned = await prisma.cartItem.findFirst({
    where: { id: cartItemId, cartId },
    select: { id: true },
  });
  if (!owned) return null;
  return prisma.cartItem.delete({ where: { id: cartItemId } });
}

export function clearCartItems(cartId: string) {
  return prisma.cartItem.deleteMany({ where: { cartId } });
}

/** One cheap aggregate for the header's cart badge — only called when a session exists. */
export async function getCartItemCount(userId: string): Promise<number> {
  const result = await prisma.cartItem.aggregate({
    where: { cart: { userId } },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

/**
 * Deletes stale line items, not the Cart row itself — Cart is 1:1 with User (see the schema
 * comment on Cart.updatedAt) and gets recreated for free via getOrCreateCartForBuyer's upsert
 * the next time it's needed, so there's nothing to gain by deleting it too.
 */
export function purgeAbandonedCartItems(cutoff: Date) {
  return prisma.cartItem.deleteMany({ where: { updatedAt: { lt: cutoff } } });
}
