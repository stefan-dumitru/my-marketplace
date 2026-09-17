import "server-only";
import { stripe } from "@/lib/stripe";
import { shipOrderSchema, type ShipOrderInput } from "@/lib/validations/seller-order";
import {
  cancelSellerOrderTransaction,
  getSellerOrderByIdForSeller,
  listSellerOrdersForSeller,
  markSellerOrderRefunded,
  markSellerOrderShippedForSeller,
} from "@/server/data/seller-orders";

export type ShipOrderResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof ShipOrderInput, string>>; formError?: string };

export type CancelOrderResult = { ok: true } | { ok: false; formError: string };

export function getSellerOrders(sellerId: string) {
  return listSellerOrdersForSeller(sellerId);
}

export function getSellerOrderForSeller(sellerId: string, sellerOrderId: string) {
  return getSellerOrderByIdForSeller(sellerId, sellerOrderId);
}

export async function markShipped(
  sellerId: string,
  sellerOrderId: string,
  input: ShipOrderInput
): Promise<ShipOrderResult> {
  const parsed = shipOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  const updated = await markSellerOrderShippedForSeller(
    sellerId,
    sellerOrderId,
    parsed.data.trackingNumber
  );
  if (!updated) {
    return { ok: false, formError: "This order can't be marked shipped right now." };
  }
  return { ok: true };
}

/**
 * Refund orchestration, designed to be safely re-clickable: a seller retrying after a transient
 * Stripe failure must not double-decrement stock or double-refund. cancelledAt (DB side done) is
 * tracked separately from refundedAt (Stripe side done) so a retry knows exactly which half of
 * the operation still needs to run.
 */
export async function cancelSellerOrder(
  sellerId: string,
  sellerOrderId: string
): Promise<CancelOrderResult> {
  const current = await getSellerOrderByIdForSeller(sellerId, sellerOrderId);
  if (!current) {
    return { ok: false, formError: "This order can't be cancelled right now." };
  }

  if (current.status === "cancelled" && current.refundedAt) {
    return { ok: true };
  }

  let sellerOrder = current;
  if (current.status !== "cancelled") {
    const cancelled = await cancelSellerOrderTransaction(sellerId, sellerOrderId);
    if (!cancelled) {
      return { ok: false, formError: "This order can't be cancelled right now." };
    }
    sellerOrder = cancelled;
  }

  const paymentIntentId = sellerOrder.order.payment?.stripePaymentIntentId;
  if (!paymentIntentId) {
    return {
      ok: false,
      formError:
        "Order cancelled and stock released, but the refund couldn't be processed. Try cancelling again to retry the refund.",
    };
  }

  try {
    await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: Math.round(Number(sellerOrder.subtotal) * 100),
      },
      { idempotencyKey: `refund_${sellerOrderId}` }
    );
  } catch {
    return {
      ok: false,
      formError:
        "Order cancelled and stock released, but the refund couldn't be processed. Try cancelling again to retry the refund.",
    };
  }

  await markSellerOrderRefunded(sellerOrderId);
  return { ok: true };
}
