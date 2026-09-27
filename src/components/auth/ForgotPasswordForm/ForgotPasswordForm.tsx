"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/app/(storefront)/auth/forgot-password/actions";

type Props = {
  onSubmitted: () => void;
};

export function ForgotPasswordForm({ onSubmitted }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (data: ForgotPasswordInput) => {
    await forgotPasswordAction(data);
    // Always shows the same "check your email" state, whether or not the address exists — see
    // forgotPasswordAction's no-enumeration comment.
    onSubmitted();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
