import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

type Props = {
  sellerOrder: {
    id: string;
    status: string;
    subtotal: unknown;
    refundedAt: Date | null;
    order: { orderNumber: string; createdAt: Date };
  };
};

export function SellerOrderRow({ sellerOrder }: Props) {
  const statusLabel = STATUS_LABEL[sellerOrder.status] ?? sellerOrder.status;
  const refundNote =
    sellerOrder.status === "cancelled" ? (sellerOrder.refundedAt ? " — Refunded" : " — Refund pending") : "";

  return (
    <Card className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{sellerOrder.order.orderNumber}</p>
        <p className="text-muted-foreground">
          {new Date(sellerOrder.order.createdAt).toLocaleDateString("ro-RO")}
        </p>
        <p className="text-muted-foreground">
          {statusLabel}
          {refundNote}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <p className="font-medium">{formatPrice(sellerOrder.subtotal)}</p>
        <Link href={`/seller/orders/${sellerOrder.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          View
        </Link>
      </div>
    </Card>
  );
}
