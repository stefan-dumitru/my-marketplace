import Link from "next/link";
import { getSellerContext } from "@/server/services/seller-service";
import { listProductsForSeller } from "@/server/services/product-service";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/format";

export default async function SellerDashboardPage() {
  // Non-null: the (seller) layout already redirected away any non-approved seller.
  const context = await getSellerContext();
  const profile = context!.profile!;
  const products = await listProductsForSeller(profile.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{profile.storeName}</h1>
        <Link href="/seller/products/new" className={buttonVariants()}>
          Add product
        </Link>
      </div>

      {products.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          You haven&apos;t added any products yet.
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {products.map((product) => (
            <Card key={product.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="font-medium">{product.name}</p>
                <p className="text-muted-foreground">
                  {product.category.name} · SKU {product.sku}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">
                  {product.variants[0] ? formatPrice(product.variants[0].price) : "—"}
                </p>
                <p className="text-muted-foreground">
                  {product.variants[0]?.stockQty ?? 0} in stock
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
