"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addressBookSchema, type AddressBookInput } from "@/lib/validations/address";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAddressAction, updateAddressAction } from "@/app/(storefront)/account/addresses/actions";

type Props = {
  mode?: "create" | "edit";
  /** Required (with `id`) when mode is "edit". */
  initialValues?: Partial<AddressBookInput> & { id: string };
};

export function AddressBookForm({ mode = "create", initialValues }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddressBookInput>({
    resolver: zodResolver(addressBookSchema),
    defaultValues: { isDefault: false, ...initialValues },
  });

  const onSubmit = async (data: AddressBookInput) => {
    setFormError(null);

    const result =
      mode === "edit" && initialValues
        ? await updateAddressAction(initialValues.id, data)
        : await createAddressAction(data);

    if (result.ok) {
      router.push("/account/addresses");
      router.refresh();
      return;
    }

    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as keyof AddressBookInput, { message });
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
        <Label htmlFor="label">Label (optional)</Label>
        <Input id="label" placeholder="Home, Work…" {...register("label")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recipientName">Recipient name</Label>
        <Input id="recipientName" aria-invalid={!!errors.recipientName} {...register("recipientName")} />
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

      <div className="flex items-center gap-2">
        <input id="isDefault" type="checkbox" className="h-4 w-4" {...register("isDefault")} />
        <Label htmlFor="isDefault">Set as default address</Label>
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Saving…" : mode === "edit" ? "Save changes" : "Add address"}
      </Button>
    </form>
  );
}
