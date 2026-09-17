"use client";

import { useState } from "react";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Card } from "@/components/ui/card";
import { ResendVerificationButton } from "@/components/auth/ResendVerificationButton";

export default function RegisterPage() {
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Create your account</h1>

      {registeredEmail ? (
        <Card className="flex flex-col gap-3 p-6">
          <p className="font-medium">Check your email</p>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to <strong>{registeredEmail}</strong>. You can browse
            right away — verifying your email is only required before checkout.
          </p>
          <ResendVerificationButton email={registeredEmail} />
        </Card>
      ) : (
        <>
          <RegisterForm onRegistered={setRegisteredEmail} />
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-primary underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
