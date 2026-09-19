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
  resolveReturnRequestTransaction,
} from "@/server/data/seller-orders";
import { createAuditLog } from "@/server/data/audit-log";

export type ShipOrderResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof ShipOrderInput, string>>; formError?: string };

export type CancelOrderResult = { ok: true } | { ok: false; formError: string };
export type ResolveReturnResult = { ok: true } | { ok: false; formError: string };

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

/**
 * Approve/reject orchestration for a buyer's return request, mirroring cancelSellerOrder's
 * re-clickable, two-phase structure: the DB half (return request status, sub-order status, stock
 * release) commits first and is idempotent; the Stripe refund half only runs on approval and can
 * be safely retried independently if it fails.
 */
export async function resolveReturn(
  sellerId: string,
  sellerOrderId: string,
  actorUserId: string,
  decision: "approved" | "rejected"
): Promise<ResolveReturnResult> {
  const current = await getSellerOrderByIdForSeller(sellerId, sellerOrderId);
  if (!current || !current.returnRequest) {
    return { ok: false, formError: "This return request can't be resolved right now." };
  }

  if (current.returnRequest.status !== "pending") {
    // Idempotent no-op, except an approval retry whose Stripe half hasn't completed yet — that
    // one falls through to the refund attempt below instead of short-circuiting here.
    const isRetryableApproval =
      decision === "approved" && current.returnRequest.status === "approved" && !current.refundedAt;
    if (!isRetryableApproval) return { ok: true };
  } else {
    const resolved = await resolveReturnRequestTransaction(sellerId, sellerOrderId, decision);
    if (!resolved || !resolved.returnRequest) {
      return { ok: false, formError: "This return request can't be resolved right now." };
    }
    // Logged only on this branch — the one that actually just performed the DB-side resolution —
    // never on a retry that's only redoing the refund half.
    await createAuditLog({
      actorUserId,
      action: decision === "approved" ? "return_request_approved" : "return_request_rejected",
      entityType: "ReturnRequest",
      entityId: current.returnRequest.id,
      beforeValue: { status: "pending" },
      afterValue: { status: decision },
    });

    if (decision === "rejected") {
      await sendEmail({
        to: current.order.buyer.email,
        subject: "Your return request was not approved",
        html: `<p>Your return request for order ${current.order.orderNumber} was not approved by the seller.</p>`,
        text: `Your return request for order ${current.order.orderNumber} was not approved by the seller.`,
      }).catch(() => {
        // Best-effort notification — see markDelivered for the same pattern.
      });
      return { ok: true };
    }
  }

  const paymentIntentId = current.order.payment?.stripePaymentIntentId;
  if (!paymentIntentId) {
    return {
      ok: false,
      formError:
        "Return approved and stock restored, but the refund couldn't be processed. Try approving again to retry the refund.",
    };
  }

  try {
    await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: Math.round(Number(current.subtotal) * 100),
      },
      { idempotencyKey: `return_${sellerOrderId}` }
    );
  } catch {
    return {
      ok: false,
      formError:
        "Return approved and stock restored, but the refund couldn't be processed. Try approving again to retry the refund.",
    };
  }

  await markSellerOrderRefunded(sellerOrderId);
  await createAuditLog({
    actorUserId,
    action: "seller_order_refunded",
    entityType: "SellerOrder",
    entityId: sellerOrderId,
    afterValue: { amount: current.subtotal.toString(), reason: "return" },
  });

  await sendEmail({
    to: current.order.buyer.email,
    subject: "Your return has been approved and refunded",
    html: `<p>Your return for order ${current.order.orderNumber} has been approved and refunded.</p>`,
    text: `Your return for order ${current.order.orderNumber} has been approved and refunded.`,
  }).catch(() => {
    // Best-effort notification — see markDelivered for the same pattern.
  });

  return { ok: true };
}
