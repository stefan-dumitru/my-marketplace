import { z } from "zod";

// The logo is deliberately not part of this schema — it arrives as a `File` via FormData and is
// validated/uploaded by upload-service.ts, not Zod (see SellerApplicationForm + applySellerAction).
export const sellerApplicationSchema = z.object({
  storeName: z.string().trim().min(2, "Store name must be at least 2 characters.").max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  businessRegistrationNumber: z
    .string()
    .trim()
    .min(2, "Enter your business registration number.")
    .max(50),
});

export type SellerApplicationInput = z.infer<typeof sellerApplicationSchema>;
