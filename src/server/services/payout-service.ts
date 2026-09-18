import "server-only";
import { stripe } from "@/lib/stripe";
import {
  getPayoutReadySellerOrderById,
  listPayoutReadySellerOrdersForAdmin,
  markSellerOrderPaidOut,
} from "@/server/data/seller-orders";

export type ReleasePayoutResult = { ok: true } | { ok: false; formError: string };

export function getPayoutReadyOrders() {
  return listPayoutReadySellerOrdersForAdmin();
}

/**
 * Same idempotent-retry shape as seller-order-service.ts's cancelSellerOrder: a stable
 * idempotency key means a retried Stripe call after a transient failure can never create a
 * second Transfer, and markSellerOrderPaidOut's verify-then-update means a retried DB write
 * can't either.
 */
export async function releasePayout(sellerOrderId: string): Promise<ReleasePayoutResult> {
  const order = await getPayoutReadySellerOrderById(sellerOrderId);
  if (!order) {
    return { ok: false, formError: "This order isn't ready for payout right now." };
  }

  const destination = order.seller.stripeConnectAccountId;
  if (!destination) {
    return { ok: false, formError: "This seller hasn't connected a Stripe account." };
  }

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: Math.round(Number(order.payoutAmount) * 100),
        currency: "ron",
        destination,
      },
      { idempotencyKey: `payout_${sellerOrderId}` }
    );
    await markSellerOrderPaidOut(sellerOrderId, transfer.id);
    return { ok: true };
  } catch {
    return { ok: false, formError: "Couldn't release the payout. Try again shortly." };
  }
}
