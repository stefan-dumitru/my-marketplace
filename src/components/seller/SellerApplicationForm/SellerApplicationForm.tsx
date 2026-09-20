"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  sellerApplicationSchema,
  type SellerApplicationInput,
} from "@/lib/validations/seller";
import { validateImageFile } from "@/lib/uploads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applySellerAction } from "@/app/(storefront)/sell/actions";

export function SellerApplicationForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SellerApplicationInput>({ resolver: zodResolver(sellerApplicationSchema) });

  const logoPreview = logoFile ? URL.createObjectURL(logoFile) : null;
  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const handleLogoSelected = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setLogoError(null);
    const error = validateImageFile(file);
    if (error) {
      setLogoError(error);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setLogoFile(file);
  };

  const onSubmit = async (data: SellerApplicationInput) => {
    setFormError(null);

    const formData = new FormData();
    formData.set("storeName", data.storeName);
    formData.set("description", data.description ?? "");
    formData.set("businessRegistrationNumber", data.businessRegistrationNumber);
    if (logoFile) formData.set("logo", logoFile);

    const result = await applySellerAction(formData);

    if (result.ok) {
      router.refresh();
      return;
    }

    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as keyof SellerApplicationInput, { message });
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
        <Label htmlFor="storeName">Store name</Label>
        <Input id="storeName" aria-invalid={!!errors.storeName} {...register("storeName")} />
        {errors.storeName && (
          <p className="text-sm text-destructive">{errors.storeName.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="businessRegistrationNumber">Business registration number</Label>
        <Input
          id="businessRegistrationNumber"
          aria-invalid={!!errors.businessRegistrationNumber}
          {...register("businessRegistrationNumber")}
        />
        {errors.businessRegistrationNumber && (
          <p className="text-sm text-destructive">
            {errors.businessRegistrationNumber.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Store description (optional)</Label>
        <Input id="description" {...register("description")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logo">Store logo (optional)</Label>
        {logoPreview && (
          <div className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoPreview} alt="" className="h-20 w-20 rounded-md border border-border object-cover" />
            <Button type="button" variant="outline" size="sm" onClick={() => setLogoFile(null)}>
              Remove
            </Button>
          </div>
        )}
        {!logoFile && (
          <Input
            id="logo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            ref={fileInputRef}
            onChange={(e) => handleLogoSelected(e.target.files)}
          />
        )}
        {logoError && <p className="text-sm text-destructive">{logoError}</p>}
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Submitting…" : "Submit application"}
      </Button>
    </form>
  );
}
