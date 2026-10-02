"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { manageBillingAction, subscribeAction } from "@/app/(storefront)/account/subscription/actions";

type Props = { mode: "subscribe" | "manage" };

export function SubscriptionActions({ mode }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const go = () => {
    setError(null);
    startTransition(async () => {
      const result = mode === "subscribe" ? await subscribeAction() : await manageBillingAction();
      if (result.ok) window.location.assign(result.redirectUrl);
      else setError(result.formError);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={go} disabled={isPending} variant={mode === "subscribe" ? "default" : "outline"} className="self-start">
        {isPending ? "One moment…" : mode === "subscribe" ? "Subscribe" : "Manage billing"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
