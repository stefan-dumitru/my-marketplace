"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createProductSchema,
  type CreateProductInput,
  type CreateProductFormInput,
} from "@/lib/validations/product";
import { validateImageFile, MAX_PRODUCT_IMAGES } from "@/lib/uploads";
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
  /** Required (with `id`) when mode is "edit". `images` is the product's currently stored set. */
  initialValues?: Partial<CreateProductFormInput> & { id: string; images?: string[] };
};

export function ProductForm({ categories, mode = "create", initialValues }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [existingImages, setExistingImages] = useState<string[]>(initialValues?.images ?? []);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const newImagePreviews = useMemo(() => newImages.map((file) => URL.createObjectURL(file)), [newImages]);
  useEffect(() => {
    return () => {
      newImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [newImagePreviews]);

  const remainingSlots = MAX_PRODUCT_IMAGES - existingImages.length - newImages.length;

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImageError(null);

    const selected = Array.from(files);
    if (selected.length > remainingSlots) {
      setImageError(`You can add ${remainingSlots} more image(s) (${MAX_PRODUCT_IMAGES} max).`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    for (const file of selected) {
      const error = validateImageFile(file);
      if (error) {
        setImageError(error);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }
    setNewImages((prev) => [...prev, ...selected]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async (data: CreateProductInput) => {
    setFormError(null);

    const formData = new FormData();
    formData.set("categoryId", data.categoryId);
    formData.set("name", data.name);
    formData.set("brand", data.brand ?? "");
    formData.set("description", data.description ?? "");
    formData.set("price", String(data.price));
    formData.set("stockQty", String(data.stockQty));
    existingImages.forEach((url) => formData.append("existingImages", url));
    newImages.forEach((file) => formData.append("images", file));

    let result;
    if (mode === "edit" && initialValues) {
      result = await updateProductAction(initialValues.id, formData);
    } else {
      formData.set("sku", data.sku);
      result = await createProductAction(formData);
    }

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
        <Label htmlFor="images">Images (optional, up to {MAX_PRODUCT_IMAGES})</Label>
        {(existingImages.length > 0 || newImages.length > 0) && (
          <div className="flex flex-wrap gap-3">
            {existingImages.map((url) => (
              <div key={url} className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-20 w-20 rounded-md border border-border object-cover" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExistingImages((prev) => prev.filter((existing) => existing !== url))}
                >
                  Remove
                </Button>
              </div>
            ))}
            {newImages.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={newImagePreviews[index]}
                  alt=""
                  className="h-20 w-20 rounded-md border border-border object-cover"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNewImages((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
        {remainingSlots > 0 && (
          <Input
            id="images"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            ref={fileInputRef}
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
        )}
        {imageError && <p className="text-sm text-destructive">{imageError}</p>}
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
