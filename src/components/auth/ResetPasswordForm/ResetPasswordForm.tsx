"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/app/(storefront)/auth/reset-password/actions";

type Props = {
  email: string;
  token: string;
};

export function ResetPasswordForm({ email, token }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = async (data: ResetPasswordInput) => {
    setFormError(null);
    const result = await resetPasswordAction(email, token, data);

    if (!result.ok) {
      setFormError(result.formError ?? "Something went wrong. Please try again.");
      return;
    }

    setDone(true);
  };

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-medium">Password reset</p>
        <p className="text-sm text-muted-foreground">
          Your password has been changed. You&apos;ve been logged out everywhere else for
          security — log in again with your new password.
        </p>
        <Button onClick={() => router.push("/auth/login")}>Go to login</Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}
