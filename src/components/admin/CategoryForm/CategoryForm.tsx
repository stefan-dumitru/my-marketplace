"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  categorySchema,
  type CategoryInput,
  type CategoryFormInput,
} from "@/lib/validations/category";
import { validateImageFile } from "@/lib/uploads";
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
  initialValues?: Partial<CategoryFormInput> & { id: string; imageUrl?: string | null };
};

export function CategoryForm({ categories, mode = "create", initialValues }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(initialValues?.imageUrl ?? null);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const newImagePreview = newImageFile ? URL.createObjectURL(newImageFile) : null;
  useEffect(() => {
    return () => {
      if (newImagePreview) URL.revokeObjectURL(newImagePreview);
    };
  }, [newImagePreview]);

  const handleImageSelected = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setImageError(null);
    const error = validateImageFile(file);
    if (error) {
      setImageError(error);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setNewImageFile(file);
  };

  const onSubmit = async (data: CategoryInput) => {
    setFormError(null);

    const formData = new FormData();
    formData.set("name", data.name);
    formData.set("parentId", data.parentId ?? "");
    formData.set("isActive", String(data.isActive));
    formData.set("defaultCommissionRate", String(data.defaultCommissionRate));
    if (newImageFile) {
      formData.set("image", newImageFile);
    } else if (existingImageUrl) {
      formData.set("existingImage", existingImageUrl);
    }

    const result =
      mode === "edit" && initialValues
        ? await updateCategoryAction(initialValues.id, formData)
        : await createCategoryAction(formData);

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
            <Select value={field.value ?? ""} onValueChange={field.onChange}>
              <SelectTrigger id="parentId" className="w-full">
                {/* Base UI's SelectValue only resolves a label automatically when an `items` prop
                    is passed to Select.Root — without it (as here), it renders the raw value, so
                    the label lookup has to be done explicitly via the render-function form. */}
                <SelectValue placeholder="No parent (top-level)">
                  {(value: string | null) =>
                    parentOptions.find((c) => c.id === value)?.name ?? "No parent (top-level)"
                  }
                </SelectValue>
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
        <Label htmlFor="image">Image (optional)</Label>
        {(existingImageUrl || newImagePreview) && (
          <div className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={newImagePreview ?? existingImageUrl ?? undefined}
              alt=""
              className="h-20 w-20 rounded-md border border-border object-cover"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setExistingImageUrl(null);
                setNewImageFile(null);
              }}
            >
              Remove
            </Button>
          </div>
        )}
        {!existingImageUrl && !newImageFile && (
          <Input
            id="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            ref={fileInputRef}
            onChange={(e) => handleImageSelected(e.target.files)}
          />
        )}
        {imageError && <p className="text-sm text-destructive">{imageError}</p>}
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
