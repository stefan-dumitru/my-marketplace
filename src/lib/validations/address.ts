import { z } from "zod";

export const addressBookSchema = z.object({
  label: z.string().trim().max(50).optional().or(z.literal("")),
  recipientName: z.string().trim().min(2, "Enter the recipient's name.").max(200),
  line1: z.string().trim().min(3, "Enter a street address.").max(200),
  line2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(2, "Enter a city.").max(100),
  county: z.string().trim().min(2, "Enter a county.").max(100),
  postalCode: z.string().trim().min(3, "Enter a postal code.").max(20),
  phone: z.string().trim().min(6, "Enter a phone number.").max(30),
  isDefault: z.boolean(),
});

export type AddressBookInput = z.infer<typeof addressBookSchema>;
