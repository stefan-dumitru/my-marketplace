import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createAuditLog } from "@/server/data/audit-log";
import { notifyOrderConfirmed, notifyPaymentFailed } from "@/server/services/order-service";
import { notifyAdmins } from "@/server/services/notification-service";
import { handleSubscriptionPaymentFailed, syncSubscriptionFromStripe } from "@/server/services/subscription-service";
import type Stripe from "stripe";

// Next's App Router Route Handlers never auto-parse the body — req.text() gives the exact
// unparsed bytes Stripe signed, which is what constructEvent needs. No bodyParser config exists
// or is needed here (that's a Pages Router concept). POST handlers are never subject to the Full
// Route Cache either, so no `dynamic` export is needed.
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    logger.error({ err }, "Stripe webhook signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Subscription checkouts share this event with order payments but carry no orderId; the
        // subscription is rewritten from Stripe's own record, so redelivery is harmless.
        if (session.mode === "subscription") {
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
          if (subscriptionId) await syncSubscriptionFromStripe(subscriptionId);
          break;
        }

        const orderId = session.metadata?.orderId;
        if (!orderId) break;

        const paymentIntentId =
          typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

        // Every write below is a conditional updateMany guarded by current status, so redelivery
        // of this event is a harmless no-op — naturally idempotent with no processed-events table
        // needed, specifically because stock was already decremented at order-creation time, not
        // here. The audit log entry (and the buyer/seller notifications below) are gated on the
        // payment update's own count so a redelivery (which matches zero rows the second time)
        // can't double-log or double-notify either.
        const paymentUpdate = await prisma.payment.updateMany({
          where: { orderId, status: { not: "succeeded" } },
          data: { status: "succeeded", paidAt: new Date(), stripePaymentIntentId: paymentIntentId },
        });
        await prisma.sellerOrder.updateMany({
          where: { orderId, status: "pending" },
          data: { status: "confirmed" },
        });
        await prisma.order.updateMany({
          where: { id: orderId, status: "pending_payment" },
          data: { status: "paid" },
        });
        if (paymentUpdate.count > 0) {
          await createAuditLog({
            actorUserId: null,
            action: "payment_succeeded",
            entityType: "Payment",
            entityId: orderId,
            afterValue: { stripePaymentIntentId: paymentIntentId ?? null },
          });
          await notifyOrderConfirmed(orderId);
        }
        break;
      }

      case "checkout.session.expired": {
        // The correct abandonment event for Checkout specifically — a single card decline doesn't
        // end the session (Stripe lets the buyer retry within it), only hitting expires_at
        // unconfirmed does. Stock is deliberately NOT released here — accepted gap, see the plan.
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (!orderId) break;

        const paymentFailUpdate = await prisma.payment.updateMany({
          where: { orderId, status: "pending" },
          data: { status: "failed" },
        });
        await prisma.order.updateMany({
          where: { id: orderId, status: "pending_payment" },
          data: { status: "payment_failed" },
        });
        if (paymentFailUpdate.count > 0) {
          await createAuditLog({
            actorUserId: null,
            action: "payment_failed",
            entityType: "Payment",
            entityId: orderId,
          });
          await notifyPaymentFailed(orderId);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionFromStripe(subscription.id);
        break;
      }

      case "invoice.payment_failed": {
        await handleSubscriptionPaymentFailed(event.data.object as Stripe.Invoice);
        break;
      }

      case "account.updated": {
        // Background sync for Connect onboarding status — connect-service.ts's
        // reconcileConnectStatus is the belt-and-suspenders live check for the one page (seller
        // payouts) that can't wait on webhook delivery; this keeps payoutsEnabled fresh everywhere
        // else (notably: the admin payout queue, which reads it without a live Stripe call).
        const account = event.data.object as Stripe.Account;
        await prisma.sellerProfile.updateMany({
          where: { stripeConnectAccountId: account.id },
          data: { payoutsEnabled: account.payouts_enabled ?? false },
        });
        break;
      }

      default:
        // Unhandled event types are acknowledged, not rejected — Stripe doesn't require every
        // type to be explicitly handled.
        break;
    }
  } catch (err) {
    // Anything thrown while processing an already-signature-verified event (a DB error, a bug in
    // one of the branches above) would otherwise just 500 silently — Stripe retries on its own
    // schedule, but nobody here would know something's actually broken until orders start piling
    // up unprocessed. Surfacing it as an admin alert is the whole point of this catch; the 500
    // response (thrown again below) is what makes Stripe retry at all.
    logger.error({ err, eventType: event.type }, "Stripe webhook handler failed");
    await notifyAdmins({
      type: "webhook_failure",
      title: "Stripe webhook processing failed",
      body: `Processing a "${event.type}" webhook event (id ${event.id}) failed. Check server logs — Stripe will retry delivery, but this needs investigating.`,
      link: "/admin",
    }).catch(() => {});
    return new Response("Webhook handler error", { status: 500 });
  }

  return new Response(null, { status: 200 });
}
