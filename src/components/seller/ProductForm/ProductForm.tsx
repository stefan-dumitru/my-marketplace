"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createProductSchema,
  type CreateProductInput,
  type CreateProductFormInput,
} from "@/lib/validations/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createProductAction } from "@/app/(seller)/seller/products/new/actions";
import { updateProductAction } from "@/app/(seller)/seller/products/[id]/edit/actions";

type Props = {
  categories: { id: string; name: string }[];
  mode?: "create" | "edit";
  /** Required (with `id`) when mode is "edit". */
  initialValues?: Partial<CreateProductFormInput> & { id: string };
};

export function ProductForm({ categories, mode = "create", initialValues }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateProductFormInput, unknown, CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: initialValues,
  });

  const onSubmit = async (data: CreateProductInput) => {
    setFormError(null);

    // Edit mode always validates/submits against updateProductSchema server-side, which has no
    // sku field at all — sku is stripped here for tidiness, not as the actual security boundary.
    const result =
      mode === "edit" && initialValues
        ? await updateProductAction(initialValues.id, (({ sku: _sku, ...rest }) => rest)(data))
        : await createProductAction(data);

    if (result.ok) {
      router.push("/seller");
      router.refresh();
      return;
    }

    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as keyof CreateProductInput, { message });
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
        <Label htmlFor="name">Product name</Label>
        <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="categoryId">Category</Label>
        <Controller
          name="categoryId"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="categoryId" className="w-full" aria-invalid={!!errors.categoryId}>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.categoryId && (
          <p className="text-sm text-destructive">{errors.categoryId.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand">Brand (optional)</Label>
        <Input id="brand" {...register("brand")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Input id="description" {...register("description")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sku">SKU</Label>
        <Input id="sku" aria-invalid={!!errors.sku} disabled={mode === "edit"} {...register("sku")} />
        {mode === "edit" ? (
          <p className="text-sm text-muted-foreground">SKU can&apos;t be changed after creation.</p>
        ) : (
          errors.sku && <p className="text-sm text-destructive">{errors.sku.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="imageUrl">Image URL (optional)</Label>
        <Input id="imageUrl" aria-invalid={!!errors.imageUrl} {...register("imageUrl")} />
        {errors.imageUrl && <p className="text-sm text-destructive">{errors.imageUrl.message}</p>}
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
          {errors.stockQty && (
            <p className="text-sm text-destructive">{errors.stockQty.message}</p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting
          ? mode === "edit"
            ? "Saving…"
            : "Creating…"
          : mode === "edit"
            ? "Save changes"
            : "Create product"}
      </Button>
    </form>
  );
}
