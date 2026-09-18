"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addressSchema, type AddressInput } from "@/lib/validations/checkout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCheckoutSessionAction } from "@/app/(storefront)/checkout/actions";

type SavedAddress = {
  id: string;
  label: string | null;
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  county: string;
  postalCode: string;
  phone: string;
};

type Props = {
  savedAddresses?: SavedAddress[];
  defaultAddress?: SavedAddress | null;
};

function toFormValues(address: SavedAddress): AddressInput {
  return {
    recipientName: address.recipientName,
    line1: address.line1,
    line2: address.line2 ?? "",
    city: address.city,
    county: address.county,
    postalCode: address.postalCode,
    phone: address.phone,
  };
}

export function AddressForm({ savedAddresses = [], defaultAddress = null }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [selectedId, setSelectedId] = useState(defaultAddress?.id ?? "");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: defaultAddress ? toFormValues(defaultAddress) : undefined,
  });

  const handlePick = (id: string) => {
    setSelectedId(id);
    const picked = savedAddresses.find((a) => a.id === id);
    reset(picked ? toFormValues(picked) : { recipientName: "", line1: "", line2: "", city: "", county: "", postalCode: "", phone: "" });
  };

  const onSubmit = async (data: AddressInput) => {
    setFormError(null);
    const result = await createCheckoutSessionAction(data, saveAddress);
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

      {savedAddresses.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="savedAddress">Use a saved address</Label>
          <select
            id="savedAddress"
            value={selectedId}
            onChange={(e) => handlePick(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Enter a new address</option>
            {savedAddresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label ? `${a.label} — ` : ""}
                {a.recipientName}, {a.line1}
              </option>
            ))}
          </select>
        </div>
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

      <div className="flex items-center gap-2">
        <input
          id="saveAddress"
          type="checkbox"
          className="h-4 w-4"
          checked={saveAddress}
          onChange={(e) => setSaveAddress(e.target.checked)}
        />
        <Label htmlFor="saveAddress">Save this address to my account</Label>
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Redirecting to payment…" : "Continue to payment"}
      </Button>
    </form>
  );
}
