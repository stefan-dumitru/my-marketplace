"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { couponSchema, type CouponFormInput, type CouponInput } from "@/lib/validations/coupon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCouponAction, updateCouponAction } from "@/app/(admin)/admin/coupons/actions";

type Props = {
  mode?: "create" | "edit";
  /** Required when mode is "edit". */
  couponId?: string;
  /** Once a coupon has been redeemed its type and value are frozen (real orders reference them). */
  redeemed?: boolean;
  initialValues?: Partial<CouponFormInput>;
};

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

export function CouponForm({ mode = "create", couponId, redeemed = false, initialValues }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CouponFormInput, unknown, CouponInput>({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      type: "percentage",
      firstOrderOnly: false,
      isActive: true,
      maxRedemptionsPerUser: 1,
      ...initialValues,
    },
  });

  const isPercentage = useWatch({ control, name: "type" }) === "percentage";
  const isEdit = mode === "edit";

  const onSubmit = async (data: CouponInput) => {
    setFormError(null);
    // The action re-validates with the same schema, so it takes the form-shaped input.
    const input = data as unknown as CouponFormInput;
    const result = isEdit && couponId ? await updateCouponAction(couponId, input) : await createCouponAction(input);

    if (result.ok) {
      router.push("/admin/coupons");
      router.refresh();
      return;
    }
    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as keyof CouponInput, { message });
      }
    }
    if (result.formError) setFormError(result.formError);
  };

  const fieldError = (name: keyof CouponInput) =>
    errors[name] && <p className="text-sm text-destructive">{String(errors[name]?.message)}</p>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          autoCapitalize="characters"
          autoComplete="off"
          readOnly={isEdit}
          aria-invalid={!!errors.code}
          className="uppercase"
          {...register("code")}
        />
        <p className="text-sm text-muted-foreground">
          {isEdit
            ? "A code can't be changed after it's created."
            : "Letters, numbers, - and _. Buyers can type it in any case."}
        </p>
        {fieldError("code")}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Type</Label>
          <select id="type" disabled={redeemed} className={selectClass} {...register("type")}>
            <option value="percentage">Percentage off</option>
            <option value="fixed_amount">Fixed amount off</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="value">{isPercentage ? "Percent (1–100)" : "Amount (RON)"}</Label>
          <Input
            id="value"
            type="number"
            step="0.01"
            min="0"
            readOnly={redeemed}
            aria-invalid={!!errors.value}
            {...register("value")}
          />
          {fieldError("value")}
        </div>
      </div>
      {redeemed && (
        <p className="text-sm text-muted-foreground">
          Type and value are locked because this coupon has already been redeemed.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="minOrderAmount">Minimum order (RON, optional)</Label>
          <Input id="minOrderAmount" type="number" step="0.01" min="0" {...register("minOrderAmount")} />
          {fieldError("minOrderAmount")}
        </div>
        {isPercentage && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maxDiscountAmount">Max discount (RON, optional)</Label>
            <Input id="maxDiscountAmount" type="number" step="0.01" min="0" {...register("maxDiscountAmount")} />
            {fieldError("maxDiscountAmount")}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startsAt">Starts (optional)</Label>
          <Input id="startsAt" type="date" {...register("startsAt")} />
          {fieldError("startsAt")}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expiresAt">Expires (optional, inclusive)</Label>
          <Input id="expiresAt" type="date" {...register("expiresAt")} />
          {fieldError("expiresAt")}
        </div>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">Dates are in UTC; the end date includes that whole day.</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="maxRedemptionsTotal">Total uses (optional)</Label>
          <Input id="maxRedemptionsTotal" type="number" step="1" min="1" {...register("maxRedemptionsTotal")} />
          {fieldError("maxRedemptionsTotal")}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="maxRedemptionsPerUser">Uses per buyer (optional)</Label>
          <Input id="maxRedemptionsPerUser" type="number" step="1" min="1" {...register("maxRedemptionsPerUser")} />
          {fieldError("maxRedemptionsPerUser")}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input id="firstOrderOnly" type="checkbox" className="h-4 w-4" {...register("firstOrderOnly")} />
        <Label htmlFor="firstOrderOnly">First order only</Label>
      </div>
      <div className="flex items-center gap-2">
        <input id="isActive" type="checkbox" className="h-4 w-4" {...register("isActive")} />
        <Label htmlFor="isActive">Active</Label>
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create coupon"}
      </Button>
    </form>
  );
}
