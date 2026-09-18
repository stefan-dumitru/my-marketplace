import Link from "next/link";
import { getSellerContext } from "@/server/services/seller-service";
import { listProductsForSeller } from "@/server/services/product-service";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProductRow } from "@/components/seller/ProductRow";

export default async function SellerDashboardPage() {
  // Non-null: the (seller) layout already redirected away any non-approved seller.
  const context = await getSellerContext();
  const profile = context!.profile!;
  const products = await listProductsForSeller(profile.id);

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
          <Link href="/seller/products/new" className={buttonVariants()}>
            Add product
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          You haven&apos;t added any products yet.
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {products.map((product) => (
            <ProductRow key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
