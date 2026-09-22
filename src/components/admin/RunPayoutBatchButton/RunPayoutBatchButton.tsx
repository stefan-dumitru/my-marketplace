"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { runPayoutBatchAction } from "@/app/(admin)/admin/payouts/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Starting…" : "Run payout batch now"}
    </Button>
  );
}

export function RunPayoutBatchButton() {
  const [queued, setQueued] = useState(false);

  return (
    <form
      action={async () => {
        await runPayoutBatchAction();
        setQueued(true);
      }}
      className="flex items-center gap-3"
    >
      <SubmitButton />
      {queued && <p className="text-sm text-muted-foreground">Queued — check back shortly.</p>}
    </form>
  );
}
