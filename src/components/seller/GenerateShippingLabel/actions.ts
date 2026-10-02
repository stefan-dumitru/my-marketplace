"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateShippingLabel } from "@/server/services/carrier-service";
import { z } from "zod";

const generateLabelSchema = z.object({
  sellerOrderId: z.string().min(1),
  recipientName: z.string().min(1),
  recipientPhone: z.string().min(1),
  recipientAddress: z.string().min(1),
  recipientCity: z.string().min(1),
  recipientCounty: z.string().min(1),
  recipientPostalCode: z.string().min(1),
  pieces: z.number().int().min(1).default(1),
  weight: z.number().positive().default(0.5),
  instructions: z.string().optional(),
});

export type GenerateLabelInput = z.infer<typeof generateLabelSchema>;

export type GenerateLabelActionResult =
  | { ok: true; trackingNumber: string; labelUrl: string }
  | { ok: false; error: string };

export async function generateLabelAction(
  input: GenerateLabelInput
): Promise<GenerateLabelActionResult> {
  const session = await auth();
  if (!session || session.user.role !== "seller") {
    redirect("/auth/login?callbackUrl=/seller/orders");
  }

  try {
    const parsed = generateLabelSchema.parse(input);

    // Verify the seller owns this order
    const sellerOrder = await prisma.sellerOrder.findUnique({
      where: { id: parsed.sellerOrderId },
      select: { sellerId: true },
    });

    if (!sellerOrder) {
      return { ok: false, error: "Order not found." };
    }

    if (sellerOrder.sellerId !== session.user.sellerId) {
      return { ok: false, error: "You do not have access to this order." };
    }

    // Generate the label via the carrier service
    const result = await generateShippingLabel({
      sellerOrderId: parsed.sellerOrderId,
      recipientName: parsed.recipientName,
      recipientPhone: parsed.recipientPhone,
      recipientAddress: parsed.recipientAddress,
      recipientCity: parsed.recipientCity,
      recipientCounty: parsed.recipientCounty,
      recipientPostalCode: parsed.recipientPostalCode,
      pieces: parsed.pieces,
      weight: parsed.weight,
      instructions: parsed.instructions,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return {
      ok: true,
      trackingNumber: result.trackingNumber,
      labelUrl: result.labelUrl,
    };
  } catch (err) {
    console.error("Failed to generate label:", err);
    return {
      ok: false,
      error: "Failed to generate label. Please try again.",
    };
  }
}
