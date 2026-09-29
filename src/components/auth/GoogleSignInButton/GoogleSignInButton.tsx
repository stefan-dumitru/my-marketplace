"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function GoogleSignInButton() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    setPending(true);
    await signIn("google", { callbackUrl: searchParams.get("callbackUrl") || "/account" });
    // No setPending(false) on success — signIn navigates away. Only reachable on a thrown error,
    // which Auth.js surfaces as a redirect to /auth/login?error=... rather than a rejected
    // promise, so this line mainly guards against the (rare) case the browser never navigates.
    setPending(false);
  };

  return (
    <Button type="button" variant="outline" onClick={handleClick} disabled={pending} className="w-full">
      {pending ? "Redirecting…" : "Continue with Google"}
    </Button>
  );
}
