import "server-only";
import { stripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email";
import { shipOrderSchema, type ShipOrderInput } from "@/lib/validations/seller-order";
import {
  cancelSellerOrderTransaction,
  getSellerOrderByIdForSeller,
  listSellerOrdersForSeller,
  markSellerOrderDeliveredForSeller,
  markSellerOrderRefunded,
  markSellerOrderShippedForSeller,
} from "@/server/data/seller-orders";
import { createAuditLog } from "@/server/data/audit-log";

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
  input: ShipOrderInput,
  actorUserId: string
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
  // Prior status is guaranteed "confirmed" by markSellerOrderShippedForSeller's own
  // verify-then-update guard.
  await createAuditLog({
    actorUserId,
    action: "seller_order_shipped",
    entityType: "SellerOrder",
    entityId: sellerOrderId,
    beforeValue: { status: "confirmed" },
    afterValue: { status: "shipped", trackingNumber: parsed.data.trackingNumber },
  });
  return { ok: true };
}

export async function markDelivered(
  sellerId: string,
  sellerOrderId: string,
  actorUserId: string
): Promise<ShipOrderResult> {
  const updated = await markSellerOrderDeliveredForSeller(sellerId, sellerOrderId);
  if (!updated) {
    return { ok: false, formError: "This order can't be marked delivered right now." };
  }
  // Prior status is guaranteed "shipped" by markSellerOrderDeliveredForSeller's own
  // verify-then-update guard.
  await createAuditLog({
    actorUserId,
    action: "seller_order_delivered",
    entityType: "SellerOrder",
    entityId: sellerOrderId,
    beforeValue: { status: "shipped" },
    afterValue: { status: "delivered" },
  });

  const buyerEmail = updated.order.buyer.email;
  const orderNumber = updated.order.orderNumber;
  await sendEmail({
    to: buyerEmail,
    subject: "Your order has been delivered",
    html: `<p>Your order ${orderNumber} has been marked as delivered. Let us know what you think — you can now leave a review from your order page.</p>`,
    text: `Your order ${orderNumber} has been marked as delivered. You can now leave a review from your order page.`,
  }).catch(() => {
    // Best-effort notification — see seller-service.ts's approveSellerApplication for the same
    // pattern: an email failure shouldn't fail an otherwise-successful status change.
  });

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
  sellerOrderId: string,
  actorUserId: string
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
    // Logged only on this branch — the one that actually just performed the DB-side
    // cancellation — never on a retry that's only redoing the refund half.
    await createAuditLog({
      actorUserId,
      action: "seller_order_cancelled",
      entityType: "SellerOrder",
      entityId: sellerOrderId,
      beforeValue: { status: current.status },
      afterValue: { status: "cancelled" },
    });
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
  // Logged separately from seller_order_cancelled since the refund can complete on a later
  // retry, independent of when the DB-side cancellation itself happened.
  await createAuditLog({
    actorUserId,
    action: "seller_order_refunded",
    entityType: "SellerOrder",
    entityId: sellerOrderId,
    afterValue: { amount: sellerOrder.subtotal.toString() },
  });
  return { ok: true };
}
