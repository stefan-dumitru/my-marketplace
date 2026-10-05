import { notFound } from "next/navigation";
import { getSellerContext } from "@/server/services/seller-service";
import { getSellerOrderForSeller } from "@/server/services/seller-order-service";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/format";
import { ShipOrderForm } from "@/components/seller/ShipOrderForm";
import { CancelOrderButton } from "@/components/seller/CancelOrderButton";
import { DeliverOrderButton } from "@/components/seller/DeliverOrderButton";
import { GenerateShippingLabelForm } from "@/components/seller/GenerateShippingLabel";
import { ReturnRequestActions } from "@/components/seller/ReturnRequestActions";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

const RETURN_STATUS_LABEL: Record<string, string> = {
  approved: "Return approved and refunded",
  rejected: "Return request rejected",
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
    deliveryInstructions?: string;
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
        {Number(sellerOrder.shippingFee) > 0 && (
          <p className="text-right text-muted-foreground">
            Shipping fee (yours, no commission):{" "}
            <span className="font-medium text-foreground">{formatPrice(sellerOrder.shippingFee)}</span>
          </p>
        )}
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
        {address.deliveryInstructions && (
          <p className="mt-3">
            <span className="font-medium">Delivery instructions: </span>
            <span className="text-muted-foreground">{address.deliveryInstructions}</span>
          </p>
        )}
      </Card>

      {sellerOrder.status === "confirmed" && (
        <Card className="flex flex-col gap-4 p-4">
          <div>
            <p className="mb-2 text-sm font-medium">Mark as shipped</p>
            <ShipOrderForm
              sellerOrderId={sellerOrder.id}
              defaultTrackingNumber={sellerOrder.trackingNumber ?? undefined}
            />
          </div>
          {sellerOrder.labelUrl ? (
            <div className="border-t border-border pt-4 text-sm">
              <p className="mb-1 font-medium">Shipping label</p>
              <a
                href={sellerOrder.labelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Download PDF label
              </a>
              <p className="mt-1 text-muted-foreground">
                Tracking number {sellerOrder.trackingNumber} is filled in above — confirm to mark as shipped.
              </p>
            </div>
          ) : (
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-sm font-medium">Generate FanCourier label</p>
              <GenerateShippingLabelForm
                sellerOrderId={sellerOrder.id}
                defaultRecipientName={address.recipientName}
                defaultRecipientPhone={address.phone}
                defaultRecipientAddress={[address.line1, address.line2].filter(Boolean).join(", ")}
                defaultRecipientCity={address.city}
                defaultRecipientCounty={address.county}
                defaultRecipientPostalCode={address.postalCode}
                defaultInstructions={address.deliveryInstructions}
              />
            </div>
          )}
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
        <Card className="flex flex-col gap-3 p-4 text-sm">
          <div>
            <p className="font-medium">Tracking number</p>
            <p className="text-muted-foreground">{sellerOrder.trackingNumber}</p>
            {sellerOrder.carrierStatus && (
              <p className="mt-1 text-muted-foreground">Carrier status: {sellerOrder.carrierStatus}</p>
            )}
            {sellerOrder.labelUrl && (
              <a
                href={sellerOrder.labelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-primary underline"
              >
                Download PDF label
              </a>
            )}
            {sellerOrder.shippedAt && (
              <p className="mt-1 text-muted-foreground">
                Shipped {new Date(sellerOrder.shippedAt).toLocaleString("ro-RO")}
              </p>
            )}
          </div>
          <DeliverOrderButton sellerOrderId={sellerOrder.id} />
        </Card>
      )}

      {sellerOrder.status === "delivered" && sellerOrder.deliveredAt && (
        <Card className="p-4 text-sm">
          <p className="font-medium">Delivered</p>
          <p className="text-muted-foreground">
            {new Date(sellerOrder.deliveredAt).toLocaleString("ro-RO")}
          </p>
        </Card>
      )}

      {sellerOrder.returnRequest?.status === "pending" && (
        <Card className="flex flex-col gap-3 p-4 text-sm">
          <div>
            <p className="mb-1 font-medium">Return requested</p>
            <p className="text-muted-foreground">{sellerOrder.returnRequest.reason}</p>
          </div>
          <ReturnRequestActions sellerOrderId={sellerOrder.id} />
        </Card>
      )}

      {sellerOrder.returnRequest && sellerOrder.returnRequest.status !== "pending" && (
        <Card className="p-4 text-sm">
          <p className="font-medium">
            {RETURN_STATUS_LABEL[sellerOrder.returnRequest.status] ?? sellerOrder.returnRequest.status}
          </p>
          <p className="text-muted-foreground">{sellerOrder.returnRequest.reason}</p>
        </Card>
      )}
    </div>
  );
}
