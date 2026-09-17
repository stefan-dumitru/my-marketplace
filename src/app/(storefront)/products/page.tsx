import { listActiveProductsForStorefront } from "@/server/services/product-service";
import { ProductCard } from "@/components/product/ProductCard";

export default async function ProductsPage() {
  const products = await listActiveProductsForStorefront({ take: 24 });

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Products</h1>

      {products.length === 0 ? (
        <p className="text-muted-foreground">No products yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
