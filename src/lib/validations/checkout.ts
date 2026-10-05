import { z } from "zod";

// No `country` field — fixed to a constant server-side. Single-country (Romania) shipping for
// v1, consistent with the RON-only currency and ro-RO formatting already used elsewhere.
export const addressSchema = z.object({
  recipientName: z.string().trim().min(2, "Enter the recipient's name.").max(200),
  line1: z.string().trim().min(3, "Enter a street address.").max(200),
  line2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(2, "Enter a city.").max(100),
  county: z.string().trim().min(2, "Enter a county.").max(100),
  postalCode: z.string().trim().min(3, "Enter a postal code.").max(20),
  phone: z.string().trim().min(6, "Enter a phone number.").max(30),
  // Per order, not per saved address. 255 is FAN Courier's limit for the AWB observation field.
  deliveryInstructions: z
    .string()
    .trim()
    .max(255, "Delivery instructions can be at most 255 characters.")
    .optional()
    .or(z.literal("")),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const SHIPPING_COUNTRY = "România";
