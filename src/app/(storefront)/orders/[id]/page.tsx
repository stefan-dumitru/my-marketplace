import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrderByIdForBuyer } from "@/server/data/orders";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { ShippingTracker } from "@/components/buyer/ShippingTracker";
import { ReviewForm } from "@/components/review/ReviewForm";
import { ReturnRequestForm } from "@/components/order/ReturnRequestForm";

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

const RETURN_STATUS_LABEL: Record<string, string> = {
  pending: "Return requested — pending seller review",
  approved: "Return approved — refunded",
  rejected: "Return request rejected",
};

const REVIEW_STATUS_LABEL: Record<string, string> = {
  pending: "pending moderation",
  approved: "published",
  rejected: "not approved",
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(order.createdAt).toLocaleString("ro-RO")} ·{" "}
            {STATUS_LABEL[order.status] ?? order.status}
          </p>
        </div>
        <a href={`/api/orders/${order.id}/invoice`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Download invoice
        </a>
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
          {sellerOrder.trackingNumber && sellerOrder.status !== "cancelled" && (
            <ShippingTracker
              trackingNumber={sellerOrder.trackingNumber}
              carrierStatus={sellerOrder.carrierStatus}
              lastTrackedAt={sellerOrder.lastTrackedAt}
            />
          )}
          <div className="divide-y">
            {sellerOrder.items.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 py-2">
                <div className="flex justify-between">
                  <span>
                    {item.productNameSnapshot} × {item.quantity}
                  </span>
                  <span>{formatPrice(item.lineTotal)}</span>
                </div>
                {sellerOrder.status === "delivered" &&
                  (item.review ? (
                    <p className="text-xs text-muted-foreground">
                      You rated this {item.review.rating}/5 —{" "}
                      {REVIEW_STATUS_LABEL[item.review.status] ?? item.review.status}
                    </p>
                  ) : (
                    <ReviewForm
                      orderId={order.id}
                      orderItemId={item.id}
                      productName={item.productNameSnapshot}
                    />
                  ))}
              </div>
            ))}
          </div>
          {sellerOrder.returnRequest ? (
            <p className="text-xs text-muted-foreground">
              {RETURN_STATUS_LABEL[sellerOrder.returnRequest.status] ?? sellerOrder.returnRequest.status}
            </p>
          ) : (
            sellerOrder.status === "delivered" && (
              <ReturnRequestForm orderId={order.id} sellerOrderId={sellerOrder.id} />
            )
          )}
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

      {Number(order.shippingAmount) === 0 &&
        order.sellerOrders.some((so) => Number(so.shippingFee) > 0) && (
          <div className="flex justify-between border-t border-border pt-4 text-sm text-muted-foreground">
            <span>Shipping</span>
            <span>Free (subscription)</span>
          </div>
        )}

      {Number(order.shippingAmount) > 0 && (
        <div className="flex justify-between border-t border-border pt-4 text-sm text-muted-foreground">
          <span>Shipping</span>
          <span>{formatPrice(order.shippingAmount)}</span>
        </div>
      )}

      {Number(order.discountAmount) > 0 && (
        <div className="flex justify-between border-t border-border pt-4 text-sm text-muted-foreground">
          <span>Discount{order.couponCodeSnapshot ? ` (${order.couponCodeSnapshot})` : ""}</span>
          <span>−{formatPrice(order.discountAmount)}</span>
        </div>
      )}

      <div className="flex justify-between border-t border-border pt-4 text-lg font-semibold">
        <span>Total</span>
        <span>{formatPrice(order.totalAmount)}</span>
      </div>
    </div>
  );
}
