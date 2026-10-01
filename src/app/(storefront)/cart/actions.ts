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
import { applyCouponSchema, type ApplyCouponInput } from "@/lib/validations/coupon";
import { checkRateLimit } from "@/server/data/rate-limit";
import { applyCouponCode, removeCartCoupon, type ApplyCouponResult } from "@/server/services/coupon-service";
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

export async function applyCouponAction(input: ApplyCouponInput): Promise<ApplyCouponResult> {
  const userId = await requireBuyerId();
  const parsed = applyCouponSchema.safeParse(input);
  if (!parsed.success) return { ok: false, formError: parsed.error.issues[0]?.message ?? "Enter a code." };

  // Per user, not per IP: applying a code needs a login, and the thing being protected is guessing
  // valid codes — a handful of attempts per window is plenty for a real buyer.
  const rateLimit = await checkRateLimit(`coupon-apply:${userId}`, { limit: 10, windowSeconds: 600 });
  if (!rateLimit.allowed) {
    return { ok: false, formError: "Too many attempts. Please wait a few minutes and try again." };
  }

  const result = await applyCouponCode(userId, parsed.data.code);
  revalidatePath("/cart");
  return result;
}

export async function removeCouponAction(): Promise<void> {
  const userId = await requireBuyerId();
  await removeCartCoupon(userId);
  revalidatePath("/cart");
}
