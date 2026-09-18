import { getPendingProductsForAdmin } from "@/server/services/product-service";
import { ProductModerationRow } from "@/components/admin/ProductModerationRow";
import { Card } from "@/components/ui/card";

export default async function AdminProductsPage() {
  const products = await getPendingProductsForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Pending products</h1>

      {products.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No products pending review.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {products.map((product) => (
            <ProductModerationRow key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
