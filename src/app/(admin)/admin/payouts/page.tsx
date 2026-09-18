import { getPayoutReadyOrders } from "@/server/services/payout-service";
import { PayoutRow } from "@/components/admin/PayoutRow";
import { Card } from "@/components/ui/card";

export default async function AdminPayoutsPage() {
  const orders = await getPayoutReadyOrders();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Payouts ready to release</h1>

      {orders.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No payouts ready right now.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((sellerOrder) => (
            <PayoutRow key={sellerOrder.id} sellerOrder={sellerOrder} />
          ))}
        </div>
      )}
    </div>
  );
}
