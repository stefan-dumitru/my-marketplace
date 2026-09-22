import { getPendingProductsForAdmin } from "@/server/services/product-service";
import { ProductModerationRow } from "@/components/admin/ProductModerationRow";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/shared/Pagination";
import { parsePage } from "@/lib/pagination";

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminProductsPage({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  const { products, hasNextPage } = await getPendingProductsForAdmin(page);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Pending products</h1>

      {products.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No products pending review.</Card>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {products.map((product) => (
              <ProductModerationRow
                key={product.id}
                product={{
                  id: product.id,
                  name: product.name,
                  sku: product.sku,
                  seller: { storeName: product.seller.storeName },
                  category: { name: product.category.name },
                  variants: product.variants.map((v) => ({ price: Number(v.price) })),
                }}
              />
            ))}
          </div>
          <Pagination page={page} hasNextPage={hasNextPage} basePath="/admin/products" />
        </>
      )}
    </div>
  );
}
