"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createReviewSchema,
  type CreateReviewFormInput,
  type CreateReviewInput,
} from "@/lib/validations/review";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitReviewAction } from "@/app/(storefront)/orders/[id]/actions";

type Props = {
  orderId: string;
  orderItemId: string;
  productName: string;
};

export function ReviewForm({ orderId, orderItemId, productName }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateReviewFormInput, unknown, CreateReviewInput>({
    resolver: zodResolver(createReviewSchema),
    defaultValues: { rating: 5 },
  });

  const onSubmit = async (data: CreateReviewInput) => {
    setFormError(null);
    const result = await submitReviewAction(orderId, orderItemId, data);
    if (result.ok) {
      setSubmitted(true);
      return;
    }
    if (result.formError) setFormError(result.formError);
  };

  if (submitted) {
    return <p className="text-sm text-muted-foreground">Thanks — your review is awaiting moderation.</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 rounded-md border border-border p-3" noValidate>
      <p className="text-sm font-medium">Review {productName}</p>

      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`rating-${orderItemId}`}>Rating</Label>
        <select
          id={`rating-${orderItemId}`}
          {...register("rating")}
          className="h-8 w-24 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </select>
        {errors.rating && <p className="text-sm text-destructive">{errors.rating.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`title-${orderItemId}`}>Title</Label>
        <Input id={`title-${orderItemId}`} aria-invalid={!!errors.title} {...register("title")} />
        {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`body-${orderItemId}`}>Review</Label>
        <textarea
          id={`body-${orderItemId}`}
          aria-invalid={!!errors.body}
          rows={3}
          {...register("body")}
          className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30"
        />
        {errors.body && <p className="text-sm text-destructive">{errors.body.message}</p>}
      </div>

      <Button type="submit" size="sm" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Submitting…" : "Submit review"}
      </Button>
    </form>
  );
}
