import Link from "next/link";
import { auth } from "@/lib/auth";
import { listActiveProductsForStorefront } from "@/server/services/product-service";
import { listActiveCategories } from "@/server/data/categories";
import { ProductCard } from "@/components/product/ProductCard";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Same "must always be current" invariant as products/(list)/page.tsx — featured products show
// live price/stock, so this can't be served from a stale cached snapshot. auth() below already
// forces dynamic rendering on its own, but this is kept explicit for the same reason that page
// keeps it explicit: so the invariant survives even if the auth() call is ever refactored away.
export const dynamic = "force-dynamic";

const FEATURED_COUNT = 8;

export default async function HomePage() {
  const [session, { products }, categories] = await Promise.all([
    auth(),
    listActiveProductsForStorefront({ page: 1 }),
    listActiveCategories({ take: 12 }),
  ]);

  const featured = products.slice(0, FEATURED_COUNT);
  // Sellers/admins already have their own dashboard CTA in the header — this hero pitch is
  // aimed at guests and buyers who haven't applied yet.
  const showSellCta = !session || session.user.role === "buyer";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-14 px-4 py-14">
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <h1 className="text-3xl font-semibold sm:text-4xl">My Marketplace</h1>
        <p className="max-w-lg text-muted-foreground">
          Shop products from independent sellers, all in one place.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/products" className={buttonVariants({ size: "lg" })}>
            Browse products
          </Link>
          {showSellCta && (
            <Link href="/sell" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Sell on My Marketplace
            </Link>
          )}
        </div>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Shop by category</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/products?category=${category.slug}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Featured products</h2>
          <Link href="/products" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            View all
          </Link>
        </div>
        {featured.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No products yet — check back soon.
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((product, i) => (
              <ProductCard key={product.id} product={product} priority={i < 4} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
