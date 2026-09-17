import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (!orderId) break;

      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

      // Every write below is a conditional updateMany guarded by current status, so redelivery
      // of this event is a harmless no-op — naturally idempotent with no processed-events table
      // needed, specifically because stock was already decremented at order-creation time, not
      // here.
      await prisma.payment.updateMany({
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
      break;
    }

    case "checkout.session.expired": {
      // The correct abandonment event for Checkout specifically — a single card decline doesn't
      // end the session (Stripe lets the buyer retry within it), only hitting expires_at
      // unconfirmed does. Stock is deliberately NOT released here — accepted gap, see the plan.
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (!orderId) break;

      await prisma.payment.updateMany({
        where: { orderId, status: "pending" },
        data: { status: "failed" },
      });
      await prisma.order.updateMany({
        where: { id: orderId, status: "pending_payment" },
        data: { status: "payment_failed" },
      });
      break;
    }

    default:
      // Unhandled event types are acknowledged, not rejected — Stripe doesn't require every
      // type to be explicitly handled.
      break;
  }

  return new Response(null, { status: 200 });
}
