import { z } from "zod";

export const variantAttributeSchema = z.object({
  key: z.string().trim().min(1, "Required").max(40),
  value: z.string().trim().min(1, "Required").max(60),
});

export const productVariantSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required.").max(64),
  attributes: z.array(variantAttributeSchema).min(1, "Add at least one attribute, e.g. Size: M."),
  price: z.coerce.number().positive("Price must be greater than 0.").max(999_999),
  stockQty: z.coerce
    .number()
    .int("Stock must be a whole number.")
    .min(0, "Stock cannot be negative."),
});

// Output type (after z.coerce runs) — used server-side and as the service/action contract.
export type ProductVariantInput = z.output<typeof productVariantSchema>;
// Input type (before coercion) — what RHF's form state actually holds pre-submit.
export type ProductVariantFormInput = z.input<typeof productVariantSchema>;

// SKU is immutable after creation, same convention as Product.sku.
export const updateVariantSchema = productVariantSchema.omit({ sku: true });
export type UpdateVariantInput = z.output<typeof updateVariantSchema>;
export type UpdateVariantFormInput = z.input<typeof updateVariantSchema>;
