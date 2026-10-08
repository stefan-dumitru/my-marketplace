import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { queueEmail } from "@/lib/email";
import { createFanCourierClient, FanCourierAPIError, type FanCourierShipmentRequest } from "@/lib/fancourier";
import { getActiveCarrierConfig } from "@/server/data/carrier-config";

/**
 * Carrier service: high-level orchestration for shipping label generation and tracking.
 * Handles FanCourier integration, error handling, and database updates.
 */

export interface GenerateLabelInput {
  sellerOrderId: string;
  recipientName: string;
  recipientPhone: string;
  recipientCity: string;
  recipientCounty: string;
  recipientPostalCode: string;
  recipientAddress: string;
  pieces?: number;
  weight?: number; // kg
  instructions?: string;
}

export interface GenerateLabelResult {
  ok: true;
  trackingNumber: string;
  labelUrl: string;
  status: string;
}

export interface GenerateLabelError {
  ok: false;
  error: string;
}

export type GenerateLabelOutcome = GenerateLabelResult | GenerateLabelError;

/**
 * Generate a shipping label for a seller order via FanCourier.
 * On success, updates the SellerOrder with the tracking number and label URL.
 * On failure, returns a clear error message for the seller.
 */
export async function generateShippingLabel(
  input: GenerateLabelInput
): Promise<GenerateLabelOutcome> {
  try {
    // Fetch the SellerOrder to ensure it exists and is in the right state
    const sellerOrder = await prisma.sellerOrder.findUnique({
      where: { id: input.sellerOrderId },
      include: { order: true },
    });

    if (!sellerOrder) {
      return { ok: false, error: "Seller order not found." };
    }

    if (sellerOrder.status !== "confirmed" && sellerOrder.status !== "shipped") {
      return {
        ok: false,
        error: "Order must be confirmed or already shipped before generating a label.",
      };
    }

    if (sellerOrder.labelUrl) {
      return { ok: false, error: "A label has already been generated for this order." };
    }

    const config = await getActiveCarrierConfig();
    if (!config || !config.isActive || !config.clientId) {
      logger.error({}, "FanCourier config not found, inactive, or missing client id");
      return { ok: false, error: "Shipping service is not configured. Please contact support." };
    }

    const client = createFanCourierClient(config.apiUsername, config.apiPassword, config.clientId);
    const shipmentRequest: FanCourierShipmentRequest = {
      recipient: {
        name: input.recipientName,
        phone: input.recipientPhone,
        county: input.recipientCounty,
        city: input.recipientCity,
        address: input.recipientAddress,
        postalCode: input.recipientPostalCode,
      },
      pieces: input.pieces ?? 1,
      weight: input.weight ?? 0.5,
      content: `Order ${sellerOrder.order.orderNumber}`,
      instructions: input.instructions,
    };

    const shipment = await client.generateShipment(shipmentRequest);

    // The label PDF is fetched on demand through an authenticated route (it contains the
    // recipient's address), so only the route path is stored.
    const labelUrl = `/api/seller/orders/${input.sellerOrderId}/label`;
    await prisma.sellerOrder.update({
      where: { id: input.sellerOrderId },
      data: {
        trackingNumber: shipment.awbNumber,
        labelUrl,
        carrierStatus: shipment.status,
      },
    });

    logger.info(
      { sellerOrderId: input.sellerOrderId, trackingNumber: shipment.awbNumber },
      "Shipping label generated"
    );

    return {
      ok: true,
      trackingNumber: shipment.awbNumber,
      labelUrl,
      status: shipment.status,
    };
  } catch (err) {
    logger.error(
      { err, sellerOrderId: input.sellerOrderId },
      "Failed to generate shipping label"
    );
    // The unique index on label tracking numbers: this number is already attached to another order.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "This tracking number is already attached to another order." };
    }
    return {
      ok: false,
      error:
        err instanceof FanCourierAPIError
          ? `${err.message}. Please check the recipient address and try again.`
          : "Failed to generate label. Please check the recipient address and try again.",
    };
  }
}

export interface FetchTrackingResult {
  ok: true;
  status: string;
  lastUpdate: Date;
  events?: Array<{ timestamp: Date; status: string; description: string }>;
}

export interface FetchTrackingError {
  ok: false;
  error: string;
}

export type FetchTrackingOutcome = FetchTrackingResult | FetchTrackingError;

/**
 * Fetch the current tracking status from FanCourier for a shipment.
 * Called by the background job to sync tracking data.
 */
export async function fetchTracking(trackingNumber: string): Promise<FetchTrackingOutcome> {
  try {
    const config = await getActiveCarrierConfig();
    if (!config || !config.isActive || !config.clientId) {
      return { ok: false, error: "FanCourier config not found, inactive, or missing client id" };
    }

    const client = createFanCourierClient(config.apiUsername, config.apiPassword, config.clientId);
    const tracking = await client.getTracking(trackingNumber);

    return {
      ok: true,
      status: tracking.status,
      lastUpdate: tracking.lastUpdate,
      events: tracking.events,
    };
  } catch (err) {
    logger.error({ err, trackingNumber }, "Failed to fetch tracking status");
    return { ok: false, error: "Could not fetch tracking status from FanCourier." };
  }
}

async function sendTrackingStatusEmail(
  sellerOrderId: string,
  newStatus: string,
  trackingNumber: string
): Promise<void> {
  try {
    const sellerOrder = await prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      include: {
        order: {
          select: { buyerId: true, orderNumber: true },
        },
      },
    });

    if (!sellerOrder || !sellerOrder.order) {
      logger.warn({ sellerOrderId }, "Could not find order for tracking email");
      return;
    }

    const buyer = await prisma.user.findUnique({
      where: { id: sellerOrder.order.buyerId },
      select: { email: true, name: true },
    });

    if (!buyer || !buyer.email) {
      logger.warn({ buyerId: sellerOrder.order.buyerId }, "Could not find buyer email for tracking email");
      return;
    }

    const statusLabels: Record<string, string> = {
      REGISTERED: "Your shipment has been registered with FanCourier",
      IN_TRANSIT: "Your package is on the way",
      OUT_FOR_DELIVERY: "Your package is out for delivery today",
      DELIVERED: "Your package has been delivered",
      EXCEPTION: "There is an issue with your delivery — the courier will try to contact you",
      RETURNED: "Your package is being returned to the seller",
    };

    const statusLabel = statusLabels[newStatus] || `Your shipment status: ${newStatus}`;

    await queueEmail({
      to: buyer.email,
      subject: `Order ${sellerOrder.order.orderNumber} - ${statusLabel}`,
      html: `
        <p>Hi ${buyer.name},</p>
        <p>${statusLabel}</p>
        <p><strong>Tracking Number:</strong> <code>${trackingNumber}</code></p>
        <p>Track your order at your order details page.</p>
        <p>Thank you for your purchase!</p>
      `,
      text: `${statusLabel}\n\nTracking Number: ${trackingNumber}\n\nTrack your order at your order details page.`,
    });

    logger.info(
      { buyerId: buyer.email, trackingNumber, status: newStatus },
      "Tracking status email queued"
    );
  } catch (err) {
    logger.error({ err, sellerOrderId }, "Failed to queue tracking status email");
  }
}

/**
 * Update a SellerOrder's tracking status and check for status changes that should trigger
 * notifications (e.g., "in_transit" or "delivered").
 */
export async function updateTrackingStatus(
  sellerOrderId: string,
  newStatus: string
): Promise<{
  updated: boolean;
  changed: boolean;
  previousStatus: string | null;
}> {
  const sellerOrder = await prisma.sellerOrder.findUnique({
    where: { id: sellerOrderId },
    include: {
      order: { select: { orderNumber: true } },
    },
  });

  if (!sellerOrder) {
    return { updated: false, changed: false, previousStatus: null };
  }

  const previousStatus = sellerOrder.carrierStatus;
  const changed = previousStatus !== newStatus;

  if (changed) {
    await prisma.sellerOrder.update({
      where: { id: sellerOrderId },
      data: {
        carrierStatus: newStatus,
        lastTrackedAt: new Date(),
        // Auto-transition to "delivered" if FanCourier says so
        ...(newStatus === "DELIVERED" && { deliveredAt: new Date() }),
      },
    });

    logger.info(
      { sellerOrderId, previousStatus, newStatus },
      "Tracking status updated"
    );

    // Send notification email to buyer about status change
    if (sellerOrder.trackingNumber) {
      await sendTrackingStatusEmail(sellerOrderId, newStatus, sellerOrder.trackingNumber);
    }
  } else if (sellerOrder.lastTrackedAt) {
    // Update lastTrackedAt even if status hasn't changed (for heartbeat tracking)
    await prisma.sellerOrder.update({
      where: { id: sellerOrderId },
      data: { lastTrackedAt: new Date() },
    });
  }

  return { updated: true, changed, previousStatus };
}

/**
 * Background job: poll FanCourier for all active shipments and sync tracking status.
 * Runs every 2 hours via Inngest cron. Updates SellerOrder tracking data and logs status changes
 * for notification triggering.
 */
export async function syncCarrierTracking(): Promise<{
  synced: number;
  changed: number;
  errors: number;
}> {
  // Find all SellerOrders with an active tracking number (status not fully terminal)
  const activeShipments = await prisma.sellerOrder.findMany({
    where: {
      trackingNumber: { not: null },
      deliveredAt: null, // Not yet delivered
      status: { notIn: ["cancelled", "returned"] },
    },
    select: {
      id: true,
      trackingNumber: true,
      carrierStatus: true,
    },
  });

  logger.info(
    { count: activeShipments.length },
    "Starting carrier tracking sync"
  );

  let synced = 0;
  let changed = 0;
  let errors = 0;

  for (const shipment of activeShipments) {
    if (!shipment.trackingNumber) continue;

    const result = await fetchTracking(shipment.trackingNumber);
    if (!result.ok) {
      logger.warn(
        { sellerOrderId: shipment.id, error: result.error },
        "Failed to fetch tracking"
      );
      errors++;
      continue;
    }

    synced++;
    const { changed: statusChanged } = await updateTrackingStatus(
      shipment.id,
      result.status
    );
    if (statusChanged) {
      changed++;
      logger.info(
        { sellerOrderId: shipment.id, previousStatus: shipment.carrierStatus, newStatus: result.status },
        "Shipment status changed"
      );
    }
  }

  logger.info(
    { synced, changed, errors },
    "Carrier tracking sync complete"
  );

  return { synced, changed, errors };
}

/**
 * Fetches the label PDF for a seller order from FAN Courier. Authorization (that the caller owns
 * the order) is the route's job; this only needs the AWB.
 */
export async function fetchLabelPdf(
  trackingNumber: string
): Promise<{ ok: true; pdf: ArrayBuffer } | { ok: false; error: string }> {
  try {
    const config = await getActiveCarrierConfig();
    if (!config || !config.isActive || !config.clientId) {
      return { ok: false, error: "Shipping service is not configured." };
    }
    const client = createFanCourierClient(config.apiUsername, config.apiPassword, config.clientId);
    return { ok: true, pdf: await client.getLabelPdf(trackingNumber) };
  } catch (err) {
    logger.error({ err, trackingNumber }, "Failed to fetch label PDF");
    return { ok: false, error: "Could not download the label from FAN Courier." };
  }
}
