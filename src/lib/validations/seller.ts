import { z } from "zod";

export const sellerApplicationSchema = z.object({
  storeName: z.string().trim().min(2, "Store name must be at least 2 characters.").max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  businessRegistrationNumber: z
    .string()
    .trim()
    .min(2, "Enter your business registration number.")
    .max(50),
  logoUrl: z.string().trim().url("Enter a valid image URL.").optional().or(z.literal("")),
});

export type SellerApplicationInput = z.infer<typeof sellerApplicationSchema>;
