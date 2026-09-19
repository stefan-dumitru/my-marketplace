"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  requestReturnSchema,
  type RequestReturnFormInput,
  type RequestReturnInput,
} from "@/lib/validations/return-request";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { requestReturnAction } from "@/app/(storefront)/orders/[id]/actions";

type Props = {
  orderId: string;
  sellerOrderId: string;
};

export function ReturnRequestForm({ orderId, sellerOrderId }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestReturnFormInput, unknown, RequestReturnInput>({
    resolver: zodResolver(requestReturnSchema),
  });

  const onSubmit = async (data: RequestReturnInput) => {
    setFormError(null);
    const result = await requestReturnAction(orderId, sellerOrderId, data);
    if (result.ok) {
      setSubmitted(true);
      return;
    }
    if (result.formError) setFormError(result.formError);
  };

  if (submitted) {
    return (
      <p className="text-sm text-muted-foreground">
        Return request submitted — the seller will review it shortly.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 rounded-md border border-border p-3" noValidate>
      <p className="text-sm font-medium">Request a return</p>

      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`reason-${sellerOrderId}`}>Reason</Label>
        <textarea
          id={`reason-${sellerOrderId}`}
          aria-invalid={!!errors.reason}
          rows={3}
          {...register("reason")}
          className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30"
        />
        {errors.reason && <p className="text-sm text-destructive">{errors.reason.message}</p>}
      </div>

      <Button type="submit" size="sm" variant="outline" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Submitting…" : "Request return"}
      </Button>
    </form>
  );
}
