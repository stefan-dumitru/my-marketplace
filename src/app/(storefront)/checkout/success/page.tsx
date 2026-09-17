import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOrderByIdForBuyer } from "@/server/data/orders";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";

type Props = {
  searchParams: Promise<{ orderId?: string }>;
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { orderId } = await searchParams;
  if (!orderId) redirect("/orders");

  // Ownership-checked, never trusts the param alone.
  const order = await getOrderByIdForBuyer(session.user.id, orderId);
  if (!order) redirect("/orders");

  // Stripe's redirect back here can beat webhook delivery (they're asynchronous), so this must
  // render conditionally on the DB's current status, never assert success just from arriving here.
  const isConfirmed = order.status === "paid";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      {isConfirmed ? (
        <>
          <h1 className="text-2xl font-semibold">Order confirmed</h1>
          <p className="text-muted-foreground">
            Thanks — your order <strong>{order.orderNumber}</strong> is confirmed.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Confirming your order…</h1>
          <p className="text-muted-foreground">
            We&apos;re still confirming payment for order <strong>{order.orderNumber}</strong>.
            Refresh in a moment — this usually only takes a few seconds.
          </p>
        </>
      )}

      <Card className="w-full p-4 text-left text-sm">
        <p className="font-medium">Total: {formatPrice(order.totalAmount)}</p>
      </Card>

      <Link href={`/orders/${order.id}`} className={buttonVariants()}>
        View order
      </Link>
    </div>
  );
}
