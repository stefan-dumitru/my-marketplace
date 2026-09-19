"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { resolveReturnRequestAction } from "@/app/(seller)/seller/orders/actions";

function SubmitButton({ variant, children }: { variant: "default" | "outline"; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" disabled={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

export function ReturnRequestActions({ sellerOrderId }: { sellerOrderId: string }) {
  return (
    <div className="flex gap-2">
      <form action={async () => { await resolveReturnRequestAction(sellerOrderId, "approved"); }}>
        <SubmitButton variant="default">Approve</SubmitButton>
      </form>
      <form action={async () => { await resolveReturnRequestAction(sellerOrderId, "rejected"); }}>
        <SubmitButton variant="outline">Reject</SubmitButton>
      </form>
    </div>
  );
}
