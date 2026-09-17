import { getSellerContext } from "@/server/services/seller-service";
import { getSellerOrders } from "@/server/services/seller-order-service";
import { Card } from "@/components/ui/card";
import { SellerOrderRow } from "@/components/seller/SellerOrderRow";

export default async function SellerOrdersPage() {
  // Non-null: the (seller) layout already redirected away any non-approved seller.
  const context = await getSellerContext();
  const profile = context!.profile!;
  const sellerOrders = await getSellerOrders(profile.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Orders</h1>

      {sellerOrders.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">You don&apos;t have any orders yet.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sellerOrders.map((sellerOrder) => (
            <SellerOrderRow key={sellerOrder.id} sellerOrder={sellerOrder} />
          ))}
        </div>
      )}
    </div>
  );
}
