"use client";

import { useFormStatus } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { releasePayoutAction } from "@/app/(admin)/admin/payouts/actions";

type Props = {
  sellerOrder: {
    id: string;
    payoutAmount: unknown;
    deliveredAt: Date | null;
    seller: { storeName: string };
    order: { orderNumber: string };
  };
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Working…" : "Release payout"}
    </Button>
  );
}

export function PayoutRow({ sellerOrder }: Props) {
  return (
    <Card className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{sellerOrder.seller.storeName}</p>
        <p className="text-muted-foreground">{sellerOrder.order.orderNumber}</p>
        {sellerOrder.deliveredAt && (
          <p className="text-muted-foreground">
            Delivered {new Date(sellerOrder.deliveredAt).toLocaleDateString("ro-RO")}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <p className="font-medium">{formatPrice(sellerOrder.payoutAmount)}</p>
        <form action={async () => { await releasePayoutAction(sellerOrder.id); }}>
          <SubmitButton />
        </form>
      </div>
    </Card>
  );
}
