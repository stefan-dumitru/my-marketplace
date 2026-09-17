import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOrdersForBuyer } from "@/server/data/orders";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  payment_failed: "Payment failed",
};

export default async function OrdersPage() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/orders");

  const orders = await getOrdersForBuyer(session.user.id);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Your orders</h1>

      {orders.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          You haven&apos;t placed any orders yet.
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <Link key={order.id} href={`/orders/${order.id}`}>
              <Card className="flex items-center justify-between p-4 text-sm">
                <div>
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString("ro-RO")} ·{" "}
                    {STATUS_LABEL[order.status] ?? order.status}
                  </p>
                </div>
                <p className="font-medium">{formatPrice(order.totalAmount)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
