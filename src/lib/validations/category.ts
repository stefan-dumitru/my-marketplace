import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120),
  parentId: z.string().optional().or(z.literal("")),
  imageUrl: z.string().trim().url("Enter a valid image URL.").optional().or(z.literal("")),
  isActive: z.boolean(),
  defaultCommissionRate: z.coerce
    .number()
    .min(0, "Rate must be at least 0.")
    .max(1, "Rate must be at most 1."),
});

// Output type (after z.coerce runs) — used server-side and as the service/action contract.
export type CategoryInput = z.output<typeof categorySchema>;
// Input type (before coercion) — what RHF's form state actually holds pre-submit.
export type CategoryFormInput = z.input<typeof categorySchema>;
