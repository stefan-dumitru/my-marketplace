import { z } from "zod";

export const addToCartSchema = z.object({
  productVariantId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(99),
});
export type AddToCartInput = z.output<typeof addToCartSchema>;
export type AddToCartFormInput = z.input<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({
  cartItemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(99),
});
export type UpdateCartItemInput = z.output<typeof updateCartItemSchema>;
export type UpdateCartItemFormInput = z.input<typeof updateCartItemSchema>;

export const removeCartItemSchema = z.object({
  cartItemId: z.string().min(1),
});
export type RemoveCartItemInput = z.infer<typeof removeCartItemSchema>;
