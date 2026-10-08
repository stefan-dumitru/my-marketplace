"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { markShippedAction } from "@/app/(seller)/seller/orders/actions";

/**
 * No tracking-number input on purpose: an order ships with the number created together with its
 * FAN Courier label, so the seller only confirms. `trackingNumber` is null until a label exists.
 */
export function ShipOrderForm({
  sellerOrderId,
  trackingNumber,
}: {
  sellerOrderId: string;
  trackingNumber: string | null;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async () => {
    setFormError(null);
    setIsSubmitting(true);
    const result = await markShippedAction(sellerOrderId);
    setIsSubmitting(false);
    if (!result.ok) setFormError(result.formError ?? "This order can't be marked shipped right now.");
  };

  return (
    <div className="flex flex-col gap-3">
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      {trackingNumber ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Tracking number (from the label): </span>
          <span className="font-mono font-medium">{trackingNumber}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Generate the FAN Courier label below first. An order can only be marked as shipped with the tracking number
          created with its label.
        </p>
      )}

      <Button onClick={handleClick} disabled={isSubmitting || !trackingNumber} className="self-start">
        {isSubmitting ? "Marking shipped…" : "Mark as shipped"}
      </Button>
    </div>
  );
}
