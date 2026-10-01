import "server-only";
import { stripe } from "@/lib/stripe";
import { queueEmail } from "@/lib/email";
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
import { getSellerDashboardStats } from "@/server/data/dashboard";
import { notifyUser } from "@/server/services/notification-service";
import { splitPage } from "@/lib/pagination";
import { toCents, fromCents } from "@/lib/coupons";

/** What the buyer actually paid for this sub-order: its subtotal minus its share of any coupon
 * discount. Sellers' payouts are NOT reduced by coupons (platform-funded), but a refund must never
 * hand back more than was charged — across all of an order's sub-orders these sum to exactly the
 * amount Stripe collected. */
function paidCents(so: { subtotal: unknown; discountAllocated: unknown }) {
  return toCents(Number(so.subtotal)) - toCents(Number(so.discountAllocated));
}

export type ShipOrderResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof ShipOrderInput, string>>; formError?: string };

export type CancelOrderResult = { ok: true } | { ok: false; formError: string };
export type ResolveReturnResult = { ok: true } | { ok: false; formError: string };

export async function getSellerOrders(sellerId: string, page?: number) {
  const rows = await listSellerOrdersForSeller(sellerId, { page });
  const { items: sellerOrders, hasNextPage } = splitPage(rows);
  return { sellerOrders, hasNextPage };
}

export function getSellerDashboard(sellerId: string) {
  return getSellerDashboardStats(sellerId);
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

  const buyerEmail = updated.order.buyer.email;
  const orderNumber = updated.order.orderNumber;
  const shippedTitle = "Your order has shipped";
  const shippedBody = `Your order ${orderNumber} has shipped${parsed.data.trackingNumber ? ` — tracking number ${parsed.data.trackingNumber}` : ""}.`;
  await queueEmail({
    to: buyerEmail,
    subject: shippedTitle,
    html: `<p>${shippedBody}</p>`,
    text: shippedBody,
  }).catch(() => {
    // Best-effort notification — see markDelivered for the same pattern.
  });
  await notifyUser({
    userId: updated.order.buyer.id,
    type: "order_shipped",
    title: shippedTitle,
    body: shippedBody,
    link: `/orders/${updated.orderId}`,
  }).catch(() => {});

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
  const deliveredTitle = "Your order has been delivered";
  const deliveredBody = `Your order ${orderNumber} has been marked as delivered. You can now leave a review from your order page.`;
  await queueEmail({
    to: buyerEmail,
    subject: deliveredTitle,
    html: `<p>Your order ${orderNumber} has been marked as delivered. Let us know what you think — you can now leave a review from your order page.</p>`,
    text: deliveredBody,
  }).catch(() => {
    // Best-effort notification — see seller-service.ts's approveSellerApplication for the same
    // pattern: an email failure shouldn't fail an otherwise-successful status change.
  });
  await notifyUser({
    userId: updated.order.buyer.id,
    type: "order_delivered",
    title: deliveredTitle,
    body: deliveredBody,
    link: `/orders/${updated.orderId}`,
  }).catch(() => {});

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
        amount: paidCents(sellerOrder),
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
    afterValue: { amount: fromCents(paidCents(sellerOrder)).toFixed(2) },
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
      const rejectedTitle = "Your return request was not approved";
      const rejectedBody = `Your return request for order ${current.order.orderNumber} was not approved by the seller.`;
      await queueEmail({
        to: current.order.buyer.email,
        subject: rejectedTitle,
        html: `<p>${rejectedBody}</p>`,
        text: rejectedBody,
      }).catch(() => {
        // Best-effort notification — see markDelivered for the same pattern.
      });
      await notifyUser({
        userId: current.order.buyer.id,
        type: "return_rejected",
        title: rejectedTitle,
        body: rejectedBody,
        link: `/orders/${current.orderId}`,
      }).catch(() => {});
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
        amount: paidCents(current),
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
    afterValue: { amount: fromCents(paidCents(current)).toFixed(2), reason: "return" },
  });

  const approvedTitle = "Your return has been approved and refunded";
  const approvedBody = `Your return for order ${current.order.orderNumber} has been approved and refunded.`;
  await queueEmail({
    to: current.order.buyer.email,
    subject: approvedTitle,
    html: `<p>${approvedBody}</p>`,
    text: approvedBody,
  }).catch(() => {
    // Best-effort notification — see markDelivered for the same pattern.
  });
  await notifyUser({
    userId: current.order.buyer.id,
    type: "return_approved",
    title: approvedTitle,
    body: approvedBody,
    link: `/orders/${current.orderId}`,
  }).catch(() => {});

  return { ok: true };
}
