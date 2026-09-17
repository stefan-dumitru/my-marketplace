"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addressSchema, type AddressInput } from "@/lib/validations/checkout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCheckoutSessionAction } from "@/app/(storefront)/checkout/actions";

export function AddressForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddressInput>({ resolver: zodResolver(addressSchema) });

  const onSubmit = async (data: AddressInput) => {
    setFormError(null);
    const result = await createCheckoutSessionAction(data);
    // A successful call redirects (to Stripe or /checkout/failed) and never returns — only a
    // validation/business-rule failure resolves here with a result to show inline.
    if (result && !result.ok) {
      setFormError(result.formError);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recipientName">Recipient name</Label>
        <Input
          id="recipientName"
          aria-invalid={!!errors.recipientName}
          {...register("recipientName")}
        />
        {errors.recipientName && (
          <p className="text-sm text-destructive">{errors.recipientName.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="line1">Street address</Label>
        <Input id="line1" aria-invalid={!!errors.line1} {...register("line1")} />
        {errors.line1 && <p className="text-sm text-destructive">{errors.line1.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="line2">Apartment, suite, etc. (optional)</Label>
        <Input id="line2" {...register("line2")} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" aria-invalid={!!errors.city} {...register("city")} />
          {errors.city && <p className="text-sm text-destructive">{errors.city.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="county">County</Label>
          <Input id="county" aria-invalid={!!errors.county} {...register("county")} />
          {errors.county && <p className="text-sm text-destructive">{errors.county.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="postalCode">Postal code</Label>
          <Input id="postalCode" aria-invalid={!!errors.postalCode} {...register("postalCode")} />
          {errors.postalCode && (
            <p className="text-sm text-destructive">{errors.postalCode.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" type="tel" aria-invalid={!!errors.phone} {...register("phone")} />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Redirecting to payment…" : "Continue to payment"}
      </Button>
    </form>
  );
}
