"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { shipOrderSchema, type ShipOrderInput } from "@/lib/validations/seller-order";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markShippedAction } from "@/app/(seller)/seller/orders/actions";

export function ShipOrderForm({ sellerOrderId }: { sellerOrderId: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ShipOrderInput>({ resolver: zodResolver(shipOrderSchema) });

  const onSubmit = async (data: ShipOrderInput) => {
    setFormError(null);
    const result = await markShippedAction(sellerOrderId, data);
    if (!result.ok) {
      setFormError(result.formError ?? null);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trackingNumber">Tracking number</Label>
        <Input
          id="trackingNumber"
          aria-invalid={!!errors.trackingNumber}
          {...register("trackingNumber")}
        />
        {errors.trackingNumber && (
          <p className="text-sm text-destructive">{errors.trackingNumber.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Marking shipped…" : "Mark as shipped"}
      </Button>
    </form>
  );
}
