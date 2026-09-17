import { z } from "zod";

export const shipOrderSchema = z.object({
  trackingNumber: z.string().trim().min(3, "Enter a tracking number.").max(100),
});

export type ShipOrderInput = z.infer<typeof shipOrderSchema>;
