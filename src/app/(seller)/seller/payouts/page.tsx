import { getSellerContext } from "@/server/services/seller-service";
import { getSellerOrders } from "@/server/services/seller-order-service";
import { reconcileConnectStatus } from "@/server/services/connect-service";
import { ConnectPayoutsCard } from "@/components/seller/ConnectPayoutsCard";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/format";

export default async function SellerPayoutsPage() {
  // Non-null: the (seller) layout already redirected away any non-approved seller.
  const context = await getSellerContext();
  const profile = context!.profile!;

  const [payoutsEnabled, sellerOrders] = await Promise.all([
    reconcileConnectStatus(profile.id),
    getSellerOrders(profile.id),
  ]);

  const status = !profile.stripeConnectAccountId
    ? "not_connected"
    : payoutsEnabled
      ? "enabled"
      : "onboarding_incomplete";

  const deliveredOrders = sellerOrders.filter((so) => so.status === "delivered");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Payouts</h1>

      <ConnectPayoutsCard status={status} />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Payout history</h2>
        {deliveredOrders.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No delivered orders yet.</Card>
        ) : (
          <div className="flex flex-col gap-3">
            {deliveredOrders.map((so) => (
              <Card key={so.id} className="flex items-center justify-between p-4 text-sm">
                <div>
                  <p className="font-medium">{so.order.orderNumber}</p>
                  <p className="text-muted-foreground">
                    {so.payoutAt ? `Paid out ${new Date(so.payoutAt).toLocaleDateString("ro-RO")}` : "Pending payout"}
                  </p>
                </div>
                <p className="font-medium">{formatPrice(so.payoutAmount)}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
