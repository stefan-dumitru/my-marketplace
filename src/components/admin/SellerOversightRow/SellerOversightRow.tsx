"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  reinstateSellerAction,
  suspendSellerAction,
  updateCommissionAction,
} from "@/app/(admin)/admin/sellers/actions";

type Props = {
  seller: {
    id: string;
    storeName: string;
    commissionRateOverride: unknown;
    user: { name: string; email: string };
  };
  variant: "approved" | "suspended";
};

function SubmitButton({ variant, children }: { variant: "default" | "outline"; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" disabled={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

function CommissionForm({ sellerId, current }: { sellerId: string; current: unknown }) {
  const [rate, setRate] = useState(current == null ? "" : String(current));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await updateCommissionAction(sellerId, rate);
    setPending(false);
    if (!result.ok) setError(result.formError);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        placeholder="e.g. 0.08"
        className="h-8 w-24"
      />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save rate"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

export function SellerOversightRow({ seller, variant }: Props) {
  return (
    <Card className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{seller.storeName}</p>
        <p className="text-muted-foreground">
          {seller.user.name} · {seller.user.email}
        </p>
        {variant === "approved" && (
          <p className="mt-1 text-muted-foreground">
            Commission override: {seller.commissionRateOverride == null ? "none (category default)" : String(seller.commissionRateOverride)}
          </p>
        )}
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        {variant === "approved" && <CommissionForm sellerId={seller.id} current={seller.commissionRateOverride} />}
        {variant === "approved" && (
          <form action={async () => { await suspendSellerAction(seller.id); }}>
            <SubmitButton variant="outline">Suspend</SubmitButton>
          </form>
        )}
        {variant === "suspended" && (
          <form action={async () => { await reinstateSellerAction(seller.id); }}>
            <SubmitButton variant="default">Reinstate</SubmitButton>
          </form>
        )}
      </div>
    </Card>
  );
}
