"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  addToCartSchema,
  updateCartItemSchema,
  removeCartItemSchema,
  type AddToCartInput,
  type UpdateCartItemInput,
  type RemoveCartItemInput,
} from "@/lib/validations/cart";
import {
  addToCart,
  removeFromCart,
  updateCartItemQuantity,
  type CartMutationResult,
} from "@/server/services/cart-service";

// Add/update/remove are three facets of one resource (the cart), triggered from two different
// pages (product detail, cart page) — kept in one file rather than split per-route, unlike the
// seller product actions which are genuinely separate mutations on separate pages.

async function requireBuyerId(): Promise<string> {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/cart");
  return session.user.id;
}

export async function addToCartAction(input: AddToCartInput): Promise<CartMutationResult> {
  const userId = await requireBuyerId();
  const parsed = addToCartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, formError: "Invalid request." };
  const result = await addToCart(userId, parsed.data);
  revalidatePath("/cart");
  return result;
}

export async function updateCartItemQuantityAction(
  input: UpdateCartItemInput
): Promise<CartMutationResult> {
  const userId = await requireBuyerId();
  const parsed = updateCartItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, formError: "Invalid request." };
  const result = await updateCartItemQuantity(userId, parsed.data);
  revalidatePath("/cart");
  return result;
}

export async function removeCartItemAction(input: RemoveCartItemInput): Promise<CartMutationResult> {
  const userId = await requireBuyerId();
  const parsed = removeCartItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, formError: "Invalid request." };
  const result = await removeFromCart(userId, parsed.data);
  revalidatePath("/cart");
  return result;
}
