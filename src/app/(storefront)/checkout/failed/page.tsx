import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOrderByIdForBuyer } from "@/server/data/orders";
import { Card } from "@/components/ui/card";
import { RetryPaymentButton } from "@/components/checkout/RetryPaymentButton";

type Props = {
  searchParams: Promise<{ orderId?: string }>;
};

export default async function CheckoutFailedPage({ searchParams }: Props) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { orderId } = await searchParams;
  if (!orderId) redirect("/orders");

  const order = await getOrderByIdForBuyer(session.user.id, orderId);
  if (!order) redirect("/orders");

  if (order.status === "paid") redirect(`/checkout/success?orderId=${order.id}`);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Payment wasn&apos;t completed</h1>
      <p className="text-muted-foreground">
        Order <strong>{order.orderNumber}</strong> is still waiting on payment. You can retry
        below.
      </p>

      <Card className="w-full p-4 text-left text-sm text-muted-foreground">
        The items in this order are already reserved and no longer in your cart — retrying pays
        for this same order rather than starting a new one.
      </Card>

      <RetryPaymentButton orderId={order.id} />
      <Link href="/orders" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        View all orders
      </Link>
    </div>
  );
}
