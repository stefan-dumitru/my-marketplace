import Link from "next/link";
import { listActiveProductsForStorefront } from "@/server/services/product-service";
import { listActiveCategories } from "@/server/data/categories";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductFilterForm } from "@/components/product/ProductFilterForm";

// This page has no dynamic API usage (no auth/cookies) beyond searchParams, which only forces
// per-query-string dynamic rendering — without this, Next's Full Route Cache would happily keep
// serving the first-ever render of a given ?q=&category= combination (e.g. the bare /products
// URL) forever, hiding newly created/edited/deactivated products until the cache expired or the
// server restarted. Price/stock/status here must always be current.
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string; category?: string }>;
};

export default async function ProductsPage({ searchParams }: Props) {
  const { q, category } = await searchParams;

  const [products, categories] = await Promise.all([
    listActiveProductsForStorefront({ take: 24, q: q || undefined, categorySlug: category || undefined }),
    listActiveCategories(),
  ]);

  const hasFilters = Boolean(q || category);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Products</h1>

      <ProductFilterForm categories={categories} q={q} category={category} />

      {products.length === 0 ? (
        hasFilters ? (
          <p className="text-muted-foreground">
            No products match your search.{" "}
            <Link href="/products" className="text-primary underline-offset-4 hover:underline">
              Clear filters
            </Link>
          </p>
        ) : (
          <p className="text-muted-foreground">No products yet.</p>
        )
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
