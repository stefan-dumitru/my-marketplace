"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { startOnboardingAction } from "@/app/(seller)/seller/payouts/actions";

type Props = {
  status: "not_connected" | "onboarding_incomplete" | "enabled";
};

const COPY: Record<Props["status"], { title: string; body: string; button?: string }> = {
  not_connected: {
    title: "Connect your payouts",
    body: "Connect a Stripe account to receive payouts for your delivered orders.",
    button: "Connect with Stripe",
  },
  onboarding_incomplete: {
    title: "Finish setting up payouts",
    body: "Your Stripe account is started but onboarding isn't complete yet.",
    button: "Finish onboarding",
  },
  enabled: {
    title: "Payouts enabled",
    body: "Your Stripe account is connected and ready to receive payouts.",
  },
};

export function ConnectPayoutsCard({ status }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const copy = COPY[status];

  const handleClick = async () => {
    setIsPending(true);
    setError(null);
    const result = await startOnboardingAction();
    // A successful call redirects to Stripe and never returns.
    if (result && !result.ok) {
      setError(result.formError);
      setIsPending(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-4 text-sm">
      <div>
        <p className={status === "enabled" ? "font-medium text-emerald-600" : "font-medium"}>{copy.title}</p>
        <p className="text-muted-foreground">{copy.body}</p>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      {copy.button && (
        <Button onClick={handleClick} disabled={isPending} className="w-fit">
          {isPending ? "Redirecting to Stripe…" : copy.button}
        </Button>
      )}
    </Card>
  );
}
