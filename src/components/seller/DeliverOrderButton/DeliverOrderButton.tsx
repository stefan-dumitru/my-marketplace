"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { markDeliveredAction } from "@/app/(seller)/seller/orders/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Working…" : "Mark as delivered"}
    </Button>
  );
}

export function DeliverOrderButton({ sellerOrderId }: { sellerOrderId: string }) {
  return (
    <form
      action={async () => {
        await markDeliveredAction(sellerOrderId);
      }}
    >
      <SubmitButton />
    </form>
  );
}
