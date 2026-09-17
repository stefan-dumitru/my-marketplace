import { notFound } from "next/navigation";
import { getSellerContext } from "@/server/services/seller-service";
import { getSellerOrderForSeller } from "@/server/services/seller-order-service";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/format";
import { ShipOrderForm } from "@/components/seller/ShipOrderForm";
import { CancelOrderButton } from "@/components/seller/CancelOrderButton";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SellerOrderDetailPage({ params }: Props) {
  // Non-null: the (seller) layout already redirected away any non-approved seller.
  const context = await getSellerContext();
  const profile = context!.profile!;

  const { id } = await params;
  const sellerOrder = await getSellerOrderForSeller(profile.id, id);
  if (!sellerOrder) notFound();

  const address = sellerOrder.order.shippingAddressSnapshot as {
    recipientName: string;
    line1: string;
    line2?: string;
    city: string;
    county: string;
    postalCode: string;
    country: string;
    phone: string;
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{sellerOrder.order.orderNumber}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(sellerOrder.order.createdAt).toLocaleString("ro-RO")} ·{" "}
          {STATUS_LABEL[sellerOrder.status] ?? sellerOrder.status}
          {sellerOrder.status === "cancelled" &&
            (sellerOrder.refundedAt ? " — Refunded" : " — Refund pending")}
        </p>
      </div>

      <Card className="flex flex-col gap-2 p-4 text-sm">
        <div className="divide-y">
          {sellerOrder.items.map((item) => (
            <div key={item.id} className="flex justify-between py-2">
              <span>
                {item.productNameSnapshot} × {item.quantity}
              </span>
              <span>{formatPrice(item.lineTotal)}</span>
            </div>
          ))}
        </div>
        <p className="text-right text-muted-foreground">
          Subtotal: <span className="font-medium text-foreground">{formatPrice(sellerOrder.subtotal)}</span>
        </p>
      </Card>

      <Card className="p-4 text-sm">
        <p className="mb-2 font-medium">Shipping address</p>
        <p className="text-muted-foreground">
          {address.recipientName}
          <br />
          {address.line1}
          {address.line2 ? `, ${address.line2}` : ""}
          <br />
          {address.city}, {address.county} {address.postalCode}
          <br />
          {address.country} · {address.phone}
        </p>
      </Card>

      {sellerOrder.status === "confirmed" && (
        <Card className="flex flex-col gap-4 p-4">
          <div>
            <p className="mb-2 text-sm font-medium">Mark as shipped</p>
            <ShipOrderForm sellerOrderId={sellerOrder.id} />
          </div>
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-sm font-medium">Cancel order</p>
            <p className="mb-2 text-sm text-muted-foreground">
              Cancelling before shipment releases the reserved stock and automatically refunds the
              buyer for this seller&apos;s portion of the order.
            </p>
            <CancelOrderButton sellerOrderId={sellerOrder.id} />
          </div>
        </Card>
      )}

      {sellerOrder.status === "shipped" && (
        <Card className="p-4 text-sm">
          <p className="font-medium">Tracking number</p>
          <p className="text-muted-foreground">{sellerOrder.trackingNumber}</p>
          {sellerOrder.shippedAt && (
            <p className="mt-1 text-muted-foreground">
              Shipped {new Date(sellerOrder.shippedAt).toLocaleString("ro-RO")}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
