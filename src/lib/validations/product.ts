import { z } from "zod";

export const createProductSchema = z.object({
  categoryId: z.string().min(1, "Select a category."),
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  brand: z.string().trim().max(100).optional().or(z.literal("")),
  sku: z.string().trim().min(1, "SKU is required.").max(64),
  imageUrl: z.string().trim().url("Enter a valid image URL.").optional().or(z.literal("")),
  price: z.coerce.number().positive("Price must be greater than 0.").max(999_999),
  stockQty: z.coerce.number().int("Stock must be a whole number.").min(0, "Stock cannot be negative."),
});

// Output type (after z.coerce runs) — used server-side and as the service/action contract.
export type CreateProductInput = z.output<typeof createProductSchema>;
// Input type (before coercion) — what RHF's form state actually holds pre-submit, since
// z.coerce.number() fields start as whatever the <input> gives it (string) until the resolver
// runs. useForm() must be typed with this, not the output type, or zodResolver's types conflict.
export type CreateProductFormInput = z.input<typeof createProductSchema>;
