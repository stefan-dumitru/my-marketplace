"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "@/app/(storefront)/auth/verify-email/actions";

export function ResendVerificationButton({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  const handleClick = async () => {
    setState("sending");
    await resendVerificationAction(email);
    setState("sent");
  };

  if (state === "sent") {
    return <p className="text-sm text-muted-foreground">Sent — check your inbox.</p>;
  }

  return (
    <Button variant="outline" size="sm" disabled={state === "sending"} onClick={handleClick}>
      {state === "sending" ? "Sending…" : "Resend verification email"}
    </Button>
  );
}
