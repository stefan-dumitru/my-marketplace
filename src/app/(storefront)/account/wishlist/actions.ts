"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { toggleWishlistSchema, type ToggleWishlistInput } from "@/lib/validations/wishlist";
import { toggleWishlistItem, type WishlistMutationResult } from "@/server/services/wishlist-service";
import { addToCartSchema, type AddToCartInput } from "@/lib/validations/cart";
import { addToCart, type CartMutationResult } from "@/server/services/cart-service";
import { removeWishlistItem } from "@/server/data/wishlist";

// Triggered from two places (product detail page's toggle button, the wishlist list page's
// remove/move-to-cart buttons) — kept in one file rather than split per-route, same reasoning as
// cart/actions.ts's own comment on why add/update/remove live together.

async function requireBuyerId(): Promise<string> {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/account/wishlist");
  return session.user.id;
}

export async function toggleWishlistAction(input: ToggleWishlistInput): Promise<WishlistMutationResult> {
  const userId = await requireBuyerId();
  const parsed = toggleWishlistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, formError: "Invalid request." };
  const result = await toggleWishlistItem(userId, parsed.data.productId, parsed.data.action);
  revalidatePath("/account/wishlist");
  return result;
}

export async function removeFromWishlistAction(productId: string): Promise<WishlistMutationResult> {
  const userId = await requireBuyerId();
  await removeWishlistItem(userId, productId);
  revalidatePath("/account/wishlist");
  return { ok: true };
}

/** "Move to cart" is add-to-cart followed by a wishlist removal — a variant must be supplied by
 *  the caller since a wishlist entry is product-level, not variant-level (see the Wishlist model
 *  comment in schema.prisma). */
export async function moveWishlistItemToCartAction(
  productId: string,
  cartInput: AddToCartInput
): Promise<CartMutationResult> {
  const userId = await requireBuyerId();
  const parsed = addToCartSchema.safeParse(cartInput);
  if (!parsed.success) return { ok: false, formError: "Invalid request." };

  const result = await addToCart(userId, parsed.data);
  if (result.ok) {
    await removeWishlistItem(userId, productId);
    revalidatePath("/account/wishlist");
    revalidatePath("/cart");
  }
  return result;
}
