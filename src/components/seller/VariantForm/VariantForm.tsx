"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  productVariantSchema,
  type ProductVariantFormInput,
  type ProductVariantInput,
} from "@/lib/validations/product-variant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addVariantAction, updateVariantAction } from "@/app/(seller)/seller/products/[id]/variants/actions";

type Props = {
  productId: string;
  mode?: "create" | "edit";
  /** Required (with `id`) when mode is "edit". */
  initialValues?: Partial<ProductVariantFormInput> & { id: string };
};

export function VariantForm({ productId, mode = "create", initialValues }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProductVariantFormInput, unknown, ProductVariantInput>({
    resolver: zodResolver(productVariantSchema),
    defaultValues: initialValues ?? { attributes: [{ key: "", value: "" }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "attributes" });

  const onSubmit = async (data: ProductVariantInput) => {
    setFormError(null);

    // Edit mode always validates/submits against updateVariantSchema server-side, which has no
    // sku field at all — sku is stripped here for tidiness, not as the actual security boundary
    // (same precedent as ProductForm's own sku handling).
    const result =
      mode === "edit" && initialValues
        ? await updateVariantAction(productId, initialValues.id, (({ sku: _sku, ...rest }) => rest)(data))
        : await addVariantAction(productId, data);

    if (result.ok) {
      router.push(`/seller/products/${productId}/variants`);
      router.refresh();
      return;
    }

    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as keyof ProductVariantInput, { message });
      }
    }
    if (result.formError) setFormError(result.formError);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sku">SKU</Label>
        <Input id="sku" aria-invalid={!!errors.sku} disabled={mode === "edit"} {...register("sku")} />
        {mode === "edit" ? (
          <p className="text-sm text-muted-foreground">SKU can&apos;t be changed after creation.</p>
        ) : (
          errors.sku && <p className="text-sm text-destructive">{errors.sku.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Attributes</Label>
        <p className="text-sm text-muted-foreground">
          E.g. Size: M, Color: Red — buyers pick a combination of these on the product page.
        </p>
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              {index === 0 && <Label htmlFor={`attributes.${index}.key`}>Name</Label>}
              <Input
                id={`attributes.${index}.key`}
                placeholder="Size"
                aria-invalid={!!errors.attributes?.[index]?.key}
                {...register(`attributes.${index}.key` as const)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              {index === 0 && <Label htmlFor={`attributes.${index}.value`}>Value</Label>}
              <Input
                id={`attributes.${index}.value`}
                placeholder="M"
                aria-invalid={!!errors.attributes?.[index]?.value}
                {...register(`attributes.${index}.value` as const)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={fields.length <= 1}
              onClick={() => remove(index)}
            >
              Remove
            </Button>
          </div>
        ))}
        {errors.attributes?.message && (
          <p className="text-sm text-destructive">{errors.attributes.message}</p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => append({ key: "", value: "" })}
        >
          Add attribute
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">Price (RON)</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            min="0"
            aria-invalid={!!errors.price}
            {...register("price")}
          />
          {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stockQty">Stock quantity</Label>
          <Input
            id="stockQty"
            type="number"
            min="0"
            step="1"
            aria-invalid={!!errors.stockQty}
            {...register("stockQty")}
          />
          {errors.stockQty && <p className="text-sm text-destructive">{errors.stockQty.message}</p>}
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Saving…" : mode === "edit" ? "Save changes" : "Add variant"}
      </Button>
    </form>
  );
}
