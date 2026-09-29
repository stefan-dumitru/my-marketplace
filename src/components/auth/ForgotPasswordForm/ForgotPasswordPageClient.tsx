"use client";

import { useState } from "react";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { Card } from "@/components/ui/card";

type Props = {
  turnstile: { siteKey: string; nonce: string } | null;
};

export function ForgotPasswordPageClient({ turnstile }: Props) {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Forgot your password?</h1>

      {submitted ? (
        <Card className="flex flex-col gap-3 p-6">
          <p className="font-medium">Check your email</p>
          <p className="text-sm text-muted-foreground">
            If an account exists for that address, we&apos;ve sent a link to reset your password.
            The link expires in 1 hour.
          </p>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
          <ForgotPasswordForm onSubmitted={() => setSubmitted(true)} turnstile={turnstile} />
        </>
      )}

      <p className="text-sm text-muted-foreground">
        <Link href="/auth/login" className="text-primary underline-offset-4 hover:underline">
          Back to login
        </Link>
      </p>
    </div>
  );
}
