"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  cancelSellerOrder,
  markDelivered,
  markShipped,
  type CancelOrderResult,
  type ShipOrderResult,
} from "@/server/services/seller-order-service";
import { getSellerContext } from "@/server/services/seller-service";
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

  const result = await markShipped(context.profile.id, sellerOrderId, input);
  revalidatePath("/seller/orders");
  revalidatePath(`/seller/orders/${sellerOrderId}`);
  return result;
}

export async function markDeliveredAction(sellerOrderId: string): Promise<ShipOrderResult> {
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller/orders");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");

  const result = await markDelivered(context.profile.id, sellerOrderId);
  revalidatePath("/seller/orders");
  revalidatePath(`/seller/orders/${sellerOrderId}`);
  return result;
}

export async function cancelSellerOrderAction(sellerOrderId: string): Promise<CancelOrderResult> {
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller/orders");
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");

  const result = await cancelSellerOrder(context.profile.id, sellerOrderId);
  revalidatePath("/seller/orders");
  revalidatePath(`/seller/orders/${sellerOrderId}`);
  return result;
}
