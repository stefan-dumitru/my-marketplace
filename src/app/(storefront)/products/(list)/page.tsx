import Link from "next/link";
import { listActiveProductsForStorefront, listActiveBrandsForStorefront } from "@/server/services/product-service";
import { listActiveCategories } from "@/server/data/categories";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductFilterForm } from "@/components/product/ProductFilterForm";
import { Pagination } from "@/components/shared/Pagination";
import { parsePage } from "@/lib/pagination";

// This page has no dynamic API usage (no auth/cookies) beyond searchParams, which only forces
// per-query-string dynamic rendering — without this, Next's Full Route Cache would happily keep
// serving the first-ever render of a given ?q=&category= combination (e.g. the bare /products
// URL) forever, hiding newly created/edited/deactivated products until the cache expired or the
// server restarted. Price/stock/status here must always be current.
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    page?: string;
    minPrice?: string;
    maxPrice?: string;
    brand?: string;
    minRating?: string;
  }>;
};

/** A malformed/negative value is treated as "not set" rather than surfaced as a form error —
 * this field only ever comes from a plain GET query string, not a validated form submission. */
function parsePositiveNumber(value: string | undefined): number | undefined {
  const n = Number(value);
  return value && Number.isFinite(n) && n >= 0 ? n : undefined;
}

export default async function ProductsPage({ searchParams }: Props) {
  const { q, category, page: pageParam, minPrice: minPriceParam, maxPrice: maxPriceParam, brand, minRating: minRatingParam } =
    await searchParams;
  const page = parsePage(pageParam);
  const minPrice = parsePositiveNumber(minPriceParam);
  const maxPrice = parsePositiveNumber(maxPriceParam);
  const minRating = parsePositiveNumber(minRatingParam);

  const [{ products, hasNextPage }, categories, brands] = await Promise.all([
    listActiveProductsForStorefront({
      page,
      q: q || undefined,
      categorySlug: category || undefined,
      minPrice,
      maxPrice,
      brand: brand || undefined,
      minRating,
    }),
    listActiveCategories(),
    listActiveBrandsForStorefront(),
  ]);

  const hasFilters = Boolean(q || category || minPrice !== undefined || maxPrice !== undefined || brand || minRating !== undefined);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Products</h1>

      <ProductFilterForm
        categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        brands={brands}
        q={q}
        category={category}
        minPrice={minPriceParam}
        maxPrice={maxPriceParam}
        brand={brand}
        minRating={minRatingParam}
      />

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
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product, i) => (
              // First row (up to 4 cards, the widest breakpoint) is above the fold — priority
              // preloads it with fetchpriority=high instead of the default lazy-load, which is
              // what Lighthouse's LCP-discovery insight flagged as the biggest cost on this page.
              <ProductCard key={product.id} product={product} priority={i < 4} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination
              page={page}
              hasNextPage={hasNextPage}
              basePath="/products"
              extraParams={{ q, category, minPrice: minPriceParam, maxPrice: maxPriceParam, brand, minRating: minRatingParam }}
            />
          </div>
        </>
      )}
    </div>
  );
}
