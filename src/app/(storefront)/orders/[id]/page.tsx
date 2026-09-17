import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrderByIdForBuyer } from "@/server/data/orders";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  payment_failed: "Payment failed",
};

const SELLER_ORDER_STATUS_LABEL: Record<string, string> = {
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

export default async function OrderDetailPage({ params }: Props) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const order = await getOrderByIdForBuyer(session.user.id, id);
  if (!order) notFound();

  const address = order.shippingAddressSnapshot as {
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
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">{order.orderNumber}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(order.createdAt).toLocaleString("ro-RO")} ·{" "}
          {STATUS_LABEL[order.status] ?? order.status}
        </p>
      </div>

      {order.sellerOrders.map((sellerOrder) => (
        <Card key={sellerOrder.id} className="flex flex-col gap-2 p-4 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium">{sellerOrder.seller.storeName}</p>
            <p className="text-muted-foreground">
              {SELLER_ORDER_STATUS_LABEL[sellerOrder.status] ?? sellerOrder.status}
              {sellerOrder.status === "cancelled" &&
                (sellerOrder.refundedAt ? " — Refunded" : " — Refund pending")}
            </p>
          </div>
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
      ))}

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

      <div className="flex justify-between border-t border-border pt-4 text-lg font-semibold">
        <span>Total</span>
        <span>{formatPrice(order.totalAmount)}</span>
      </div>
    </div>
  );
}
