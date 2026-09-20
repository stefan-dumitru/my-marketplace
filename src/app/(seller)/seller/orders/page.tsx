import { getSellerContext } from "@/server/services/seller-service";
import { getSellerOrders } from "@/server/services/seller-order-service";
import { Card } from "@/components/ui/card";
import { SellerOrderRow } from "@/components/seller/SellerOrderRow";
import { Pagination } from "@/components/shared/Pagination";
import { parsePage } from "@/lib/pagination";

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function SellerOrdersPage({ searchParams }: Props) {
  // Non-null: the (seller) layout already redirected away any non-approved seller.
  const context = await getSellerContext();
  const profile = context!.profile!;
  const page = parsePage((await searchParams).page);
  const { sellerOrders, hasNextPage } = await getSellerOrders(profile.id, page);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Orders</h1>

      {sellerOrders.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">You don&apos;t have any orders yet.</Card>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {sellerOrders.map((sellerOrder) => (
              <SellerOrderRow key={sellerOrder.id} sellerOrder={sellerOrder} />
            ))}
          </div>
          <Pagination page={page} hasNextPage={hasNextPage} basePath="/seller/orders" />
        </>
      )}
    </div>
  );
}
