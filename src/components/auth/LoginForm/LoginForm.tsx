"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/shared/TurnstileWidget";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

const GENERIC_ERROR = "Invalid email or password.";
const SUSPENDED_ERROR = "Your account has been suspended. Contact support.";
const TOO_MANY_ATTEMPTS_ERROR = "Too many attempts. Please try again in a few minutes.";
const CAPTCHA_REQUIRED_ERROR = "Please complete the verification below and try again.";
// Generic on purpose — the Google provider's profile() callback (see auth.ts) throws a plain
// Error for both "unverified email" and "suspended account", which Auth.js surfaces as
// ?error=AccessDenied on redirect back here rather than a distinguishable code the way
// CredentialsSignin subclasses give the password flow. Good enough to fail closed and inform the
// user something blocked sign-in; not as precise as the Credentials path's specific messages.
const OAUTH_ERROR = "Couldn't sign you in with Google. Contact support if this keeps happening.";

type Props = {
  turnstile: { siteKey: string; nonce: string } | null;
  googleEnabled: boolean;
};

export function LoginForm({ turnstile, googleEnabled }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Lazy initializer (runs once, on mount) rather than an effect — this reflects the URL Auth.js
  // redirected back to after an OAuth failure, not something to re-derive on every render.
  const [formError, setFormError] = useState<string | null>(() =>
    searchParams.get("error") ? OAUTH_ERROR : null
  );

  // Only rendered after the server signals a CAPTCHA is required for this email (see
  // CAPTCHA_ATTEMPT_THRESHOLD in lib/auth.ts) — a normal first-try login never sees this, so
  // there's no added friction on the common path.
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setFormError(null);
    const result = await signIn("credentials", {
      ...data,
      turnstileToken,
      redirect: false,
    });

    if (result?.error) {
      // `code` is Auth.js's documented safe channel for a specific reason (see the
      // AccountSuspendedError comment in src/lib/auth.ts); `error` itself is always the generic
      // "CredentialsSignin" type for any authorize() failure, by design.
      if (result.code === "account_suspended") {
        setFormError(SUSPENDED_ERROR);
      } else if (result.code === "too_many_attempts") {
        setFormError(TOO_MANY_ATTEMPTS_ERROR);
      } else if (result.code === "captcha_required") {
        setFormError(CAPTCHA_REQUIRED_ERROR);
        setCaptchaRequired(true);
      } else {
        setFormError(GENERIC_ERROR);
      }
      return;
    }

    router.push(searchParams.get("callbackUrl") || "/account");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      {googleEnabled && (
        <>
          <GoogleSignInButton />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {formError && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

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

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/auth/forgot-password"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>

        {captchaRequired && turnstile && (
          <TurnstileWidget
            siteKey={turnstile.siteKey}
            nonce={turnstile.nonce}
            onVerify={setTurnstileToken}
          />
        )}

        <Button
          type="submit"
          disabled={isSubmitting || (captchaRequired && !turnstileToken)}
          className="mt-2"
        >
          {isSubmitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </div>
  );
}
