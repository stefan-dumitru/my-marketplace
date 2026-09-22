import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
};

type Props = {
  payout: {
    id: string;
    amount: unknown;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    paidAt: Date | null;
    stripeTransferId: string | null;
    seller: { storeName: string };
  };
};

// Purely presentational — batches are created only by releaseSellerPayouts (the scheduled/
// triggerable job), never released one row at a time, so there's no per-row action here anymore.
export function PayoutRow({ payout }: Props) {
  return (
    <Card className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{payout.seller.storeName}</p>
        <p className="text-muted-foreground">
          {new Date(payout.periodStart).toLocaleDateString("ro-RO")} –{" "}
          {new Date(payout.periodEnd).toLocaleDateString("ro-RO")}
        </p>
        <p className="text-muted-foreground">
          {STATUS_LABEL[payout.status] ?? payout.status}
          {payout.paidAt ? ` · Paid ${new Date(payout.paidAt).toLocaleDateString("ro-RO")}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p className="font-medium">{formatPrice(payout.amount)}</p>
        {payout.stripeTransferId && (
          <p className="text-xs text-muted-foreground">{payout.stripeTransferId}</p>
        )}
      </div>
    </Card>
  );
}
