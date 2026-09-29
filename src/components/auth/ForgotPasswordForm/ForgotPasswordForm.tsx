"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/shared/TurnstileWidget";
import { forgotPasswordAction } from "@/app/(storefront)/auth/forgot-password/actions";

type Props = {
  onSubmitted: () => void;
  turnstile: { siteKey: string; nonce: string } | null;
};

export function ForgotPasswordForm({ onSubmitted, turnstile }: Props) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (data: ForgotPasswordInput) => {
    await forgotPasswordAction(data, turnstileToken);
    // Always shows the same "check your email" state, whether or not the address exists (or the
    // CAPTCHA failed) — see forgotPasswordAction's no-enumeration comment.
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

      {turnstile && (
        <TurnstileWidget
          siteKey={turnstile.siteKey}
          nonce={turnstile.nonce}
          onVerify={setTurnstileToken}
        />
      )}

      <Button type="submit" disabled={isSubmitting || (!!turnstile && !turnstileToken)} className="mt-2">
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
