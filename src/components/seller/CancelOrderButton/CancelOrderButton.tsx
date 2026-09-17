"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cancelSellerOrderAction } from "@/app/(seller)/seller/orders/actions";

export function CancelOrderButton({ sellerOrderId }: { sellerOrderId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleClick = async () => {
    setIsPending(true);
    setError(null);
    const result = await cancelSellerOrderAction(sellerOrderId);
    setIsPending(false);
    if (!result.ok) {
      setError(result.formError);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button variant="outline" onClick={handleClick} disabled={isPending}>
        {isPending ? "Cancelling…" : error ? "Retry cancel" : "Cancel order"}
      </Button>
    </div>
  );
}
