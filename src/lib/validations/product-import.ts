import { z } from "zod";

export const importRowSkuSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required.").max(64),
});

export const importRowBaseSchema = importRowSkuSchema.extend({
  price: z.coerce.number().positive("Price must be greater than 0.").max(999_999),
  stockQty: z.coerce.number().int("Stock must be a whole number.").min(0, "Stock cannot be negative."),
});

export const importRowFullSchema = importRowBaseSchema.extend({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(200),
  categorySlug: z.string().trim().min(1, "Category is required."),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  brand: z.string().trim().max(100).optional().or(z.literal("")),
  imageUrl: z.string().trim().url("Invalid image URL.").optional().or(z.literal("")),
});

export type ImportRowBase = z.output<typeof importRowBaseSchema>;
export type ImportRowFull = z.output<typeof importRowFullSchema>;

export const importModeSchema = z.enum(["add_only", "full_replace", "attribute_update"]);
export type ImportMode = z.output<typeof importModeSchema>;
