"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  categorySchema,
  type CategoryInput,
  type CategoryFormInput,
} from "@/lib/validations/category";
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
import { createCategoryAction, updateCategoryAction } from "@/app/(admin)/admin/categories/actions";

type Props = {
  categories: { id: string; name: string }[];
  mode?: "create" | "edit";
  /** Required (with `id`) when mode is "edit". Own id is excluded from the parent picker. */
  initialValues?: Partial<CategoryFormInput> & { id: string };
};

export function CategoryForm({ categories, mode = "create", initialValues }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormInput, unknown, CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: { isActive: true, ...initialValues },
  });

  const parentOptions = categories.filter((c) => c.id !== initialValues?.id);

  const onSubmit = async (data: CategoryInput) => {
    setFormError(null);

    const result =
      mode === "edit" && initialValues
        ? await updateCategoryAction(initialValues.id, data)
        : await createCategoryAction(data);

    if (result.ok) {
      router.push("/admin/categories");
      router.refresh();
      return;
    }

    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as keyof CategoryInput, { message });
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
        <Label htmlFor="name">Name</Label>
        <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parentId">Parent category (optional)</Label>
        <Controller
          name="parentId"
          control={control}
          render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger id="parentId" className="w-full">
                <SelectValue placeholder="No parent (top-level)" />
              </SelectTrigger>
              <SelectContent>
                {parentOptions.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.parentId && <p className="text-sm text-destructive">{errors.parentId.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="imageUrl">Image URL (optional)</Label>
        <Input id="imageUrl" aria-invalid={!!errors.imageUrl} {...register("imageUrl")} />
        {errors.imageUrl && <p className="text-sm text-destructive">{errors.imageUrl.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="defaultCommissionRate">Default commission rate (0–1)</Label>
        <Input
          id="defaultCommissionRate"
          type="number"
          step="0.01"
          min="0"
          max="1"
          aria-invalid={!!errors.defaultCommissionRate}
          {...register("defaultCommissionRate")}
        />
        {errors.defaultCommissionRate && (
          <p className="text-sm text-destructive">{errors.defaultCommissionRate.message}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input id="isActive" type="checkbox" className="h-4 w-4" {...register("isActive")} />
        <Label htmlFor="isActive">Active (visible in the category picker/storefront)</Label>
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Saving…" : mode === "edit" ? "Save changes" : "Create category"}
      </Button>
    </form>
  );
}
