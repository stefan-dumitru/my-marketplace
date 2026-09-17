"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  sellerApplicationSchema,
  type SellerApplicationInput,
} from "@/lib/validations/seller";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applySellerAction } from "@/app/(storefront)/sell/actions";

export function SellerApplicationForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SellerApplicationInput>({ resolver: zodResolver(sellerApplicationSchema) });

  const onSubmit = async (data: SellerApplicationInput) => {
    setFormError(null);
    const result = await applySellerAction(data);

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
        <Label htmlFor="logoUrl">Logo image URL (optional)</Label>
        <Input id="logoUrl" aria-invalid={!!errors.logoUrl} {...register("logoUrl")} />
        {errors.logoUrl && <p className="text-sm text-destructive">{errors.logoUrl.message}</p>}
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Submitting…" : "Submit application"}
      </Button>
    </form>
  );
}
