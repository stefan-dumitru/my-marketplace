import "server-only";
import { prisma } from "@/lib/prisma";
import {
  addToCartSchema,
  updateCartItemSchema,
  removeCartItemSchema,
  type AddToCartInput,
  type UpdateCartItemInput,
  type RemoveCartItemInput,
} from "@/lib/validations/cart";
import {
  getOrCreateCartForBuyer,
  removeCartItemForBuyer,
  updateCartItemQuantityForBuyer,
  upsertCartItemQuantity,
} from "@/server/data/cart";

export type CartMutationResult = { ok: true } | { ok: false; formError: string };

async function getVariantForCartOp(productVariantId: string) {
  return prisma.productVariant.findUnique({
    where: { id: productVariantId },
    include: { product: { select: { status: true } } },
  });
}

export async function addToCart(userId: string, input: AddToCartInput): Promise<CartMutationResult> {
  const parsed = addToCartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, formError: "Invalid request." };
  const { productVariantId, quantity } = parsed.data;

  const variant = await getVariantForCartOp(productVariantId);
  if (!variant || variant.product.status !== "active") {
    return { ok: false, formError: "This product is no longer available." };
  }
  if (variant.stockQty <= 0) {
    return { ok: false, formError: "This product is out of stock." };
  }

  const cart = await getOrCreateCartForBuyer(userId);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_productVariantId: { cartId: cart.id, productVariantId } },
  });
  const finalQty = Math.min((existing?.quantity ?? 0) + quantity, variant.stockQty);

  await upsertCartItemQuantity(cart.id, productVariantId, finalQty);
  return { ok: true };
}

export async function updateCartItemQuantity(
  userId: string,
  input: UpdateCartItemInput
): Promise<CartMutationResult> {
  const parsed = updateCartItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, formError: "Invalid request." };
  const { cartItemId, quantity } = parsed.data;

  const cart = await getOrCreateCartForBuyer(userId);
  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId, cartId: cart.id },
    include: { productVariant: { select: { stockQty: true } } },
  });
  if (!item) return { ok: false, formError: "Item not found in your cart." };

  const cappedQty = Math.min(quantity, item.productVariant.stockQty);
  const updated = await updateCartItemQuantityForBuyer(cart.id, cartItemId, cappedQty);
  if (!updated) return { ok: false, formError: "Item not found in your cart." };
  return { ok: true };
}

export async function removeFromCart(
  userId: string,
  input: RemoveCartItemInput
): Promise<CartMutationResult> {
  const parsed = removeCartItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, formError: "Invalid request." };

  const cart = await getOrCreateCartForBuyer(userId);
  const removed = await removeCartItemForBuyer(cart.id, parsed.data.cartItemId);
  if (!removed) return { ok: false, formError: "Item not found in your cart." };
  return { ok: true };
}
