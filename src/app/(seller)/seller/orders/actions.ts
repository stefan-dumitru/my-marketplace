"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  cancelSellerOrder,
  markDelivered,
  markShipped,
  resolveReturn,
  type CancelOrderResult,
  type ResolveReturnResult,
  type ShipOrderResult,
} from "@/server/services/seller-order-service";
import { getSellerContext } from "@/server/services/seller-service";
import { checkRateLimit } from "@/server/data/rate-limit";
import type { ShipOrderInput } from "@/lib/validations/seller-order";

export async function markShippedAction(
  sellerOrderId: string,
  input: ShipOrderInput
): Promise<ShipOrderResult> {
  // Independently re-verified here — this Action is its own entry point, not protected by the
  // (seller) layout's redirect just because the page that rendered its form was.
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller/orders");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");

  const result = await markShipped(context.profile.id, sellerOrderId, input, context.session.user.id);
  revalidatePath("/seller/orders");
  revalidatePath(`/seller/orders/${sellerOrderId}`);
  return result;
}

export async function markDeliveredAction(sellerOrderId: string): Promise<ShipOrderResult> {
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller/orders");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");

  const result = await markDelivered(context.profile.id, sellerOrderId, context.session.user.id);
  revalidatePath("/seller/orders");
  revalidatePath(`/seller/orders/${sellerOrderId}`);
  return result;
}

export async function cancelSellerOrderAction(sellerOrderId: string): Promise<CancelOrderResult> {
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller/orders");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");

  // Shared with resolveReturnRequestAction below — both call stripe.refunds.create, a real
  // financial operation.
  const rateLimit = await checkRateLimit(`seller-order-mutation:${context.profile.id}`, {
    limit: 30,
    windowSeconds: 600,
  });
  if (!rateLimit.allowed) {
    return { ok: false, formError: "Too many attempts. Please try again shortly." };
  }

  const result = await cancelSellerOrder(context.profile.id, sellerOrderId, context.session.user.id);
  revalidatePath("/seller/orders");
  revalidatePath(`/seller/orders/${sellerOrderId}`);
  return result;
}

export async function resolveReturnRequestAction(
  sellerOrderId: string,
  decision: "approved" | "rejected"
): Promise<ResolveReturnResult> {
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller/orders");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");

  // Shared with cancelSellerOrderAction above — see its comment.
  const rateLimit = await checkRateLimit(`seller-order-mutation:${context.profile.id}`, {
    limit: 30,
    windowSeconds: 600,
  });
  if (!rateLimit.allowed) {
    return { ok: false, formError: "Too many attempts. Please try again shortly." };
  }

  const result = await resolveReturn(context.profile.id, sellerOrderId, context.session.user.id, decision);
  revalidatePath("/seller/orders");
  revalidatePath(`/seller/orders/${sellerOrderId}`);
  return result;
}
