import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { getTurnstileClientConfig } from "@/lib/turnstile";
import { googleOAuthEnabled } from "@/lib/auth";

export default async function LoginPage() {
  const turnstile = await getTurnstileClientConfig();
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <Suspense>
        <LoginForm turnstile={turnstile} googleEnabled={googleOAuthEnabled} />
      </Suspense>
      <p className="text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/auth/register" className="text-primary underline-offset-4 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
