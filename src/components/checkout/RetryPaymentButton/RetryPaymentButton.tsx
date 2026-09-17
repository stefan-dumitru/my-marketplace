"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { retryOrderPaymentAction } from "@/app/(storefront)/checkout/actions";

export function RetryPaymentButton({ orderId }: { orderId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleClick = async () => {
    setIsPending(true);
    setError(null);
    const result = await retryOrderPaymentAction(orderId);
    // A successful call redirects and never returns.
    if (result && !result.ok) {
      setError(result.formError);
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleClick} disabled={isPending}>
        {isPending ? "Redirecting to payment…" : "Retry payment"}
      </Button>
    </div>
  );
}
