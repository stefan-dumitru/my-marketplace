import Link from "next/link";
import { getSellerContext } from "@/server/services/seller-service";
import { listProductsForSeller } from "@/server/services/product-service";
import { getSellerDashboard } from "@/server/services/seller-order-service";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProductRow } from "@/components/seller/ProductRow";
import { StatTile } from "@/components/dashboard/StatTile";
import { Pagination } from "@/components/shared/Pagination";
import { formatPrice } from "@/lib/format";
import { parsePage } from "@/lib/pagination";

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function SellerDashboardPage({ searchParams }: Props) {
  // Non-null: the (seller) layout already redirected away any non-approved seller.
  const context = await getSellerContext();
  const profile = context!.profile!;
  const page = parsePage((await searchParams).page);
  const [{ products, hasNextPage }, stats] = await Promise.all([
    listProductsForSeller(profile.id, page),
    getSellerDashboard(profile.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{profile.storeName}</h1>
        <div className="flex items-center gap-3">
          <Link href="/seller/orders" className={buttonVariants({ variant: "outline" })}>
            Orders
          </Link>
          <Link href="/seller/payouts" className={buttonVariants({ variant: "outline" })}>
            Payouts
          </Link>
          <Link href="/seller/reports" className={buttonVariants({ variant: "outline" })}>
            Sales report
          </Link>
          <Link href="/seller/products/import" className={buttonVariants({ variant: "outline" })}>
            Import CSV
          </Link>
          <Link href="/seller/products/new" className={buttonVariants()}>
            Add product
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Orders this month" value={stats.ordersThisMonth} />
        <StatTile label="Pending shipment" value={stats.pendingShipment} />
        <StatTile label="Low stock" value={stats.lowStockCount} />
        <StatTile label="Pending payout" value={formatPrice(stats.pendingPayoutAmount)} />
      </div>

      {products.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          You haven&apos;t added any products yet.
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {products.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </div>
          <Pagination page={page} hasNextPage={hasNextPage} basePath="/seller" />
        </>
      )}
    </div>
  );
}
