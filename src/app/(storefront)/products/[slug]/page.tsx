import { notFound } from "next/navigation";
import { getProductForStorefront } from "@/server/services/product-service";
import { getProductReviews } from "@/server/services/review-service";
import { auth } from "@/lib/auth";
import { VariantPicker } from "@/components/product/VariantPicker";
import { ProductGallery } from "@/components/product/ProductGallery";
import { WishlistButton } from "@/components/product/WishlistButton";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductReviews } from "@/components/review/ProductReviews";
import { getCoPurchasedProducts, isProductWishlisted } from "@/server/services/wishlist-service";

// Price/stock/status must never be served stale — this invariant is about the data, not about
// which dynamic API happens to be present, so it stays an explicit export even though auth()
// below would also force dynamic rendering on its own (confirmed during a prior increment: Next's
// Full Route Cache otherwise renders this once per slug and keeps serving that same snapshot).
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const [product, session] = await Promise.all([getProductForStorefront(slug), auth()]);
  if (!product) notFound();

  const [{ reviews, summary }, wishlisted, coPurchased] = await Promise.all([
    getProductReviews(product.id),
    session ? isProductWishlisted(session.user.id, product.id) : Promise.resolve(false),
    getCoPurchasedProducts(product.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-10">
      <div className="grid gap-8 sm:grid-cols-2">
        <ProductGallery images={product.images} alt={product.name} />

        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{product.category.name}</p>
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <p className="text-sm text-muted-foreground">Sold by {product.seller.storeName}</p>
          {summary.count > 0 && (
            <p className="text-sm text-muted-foreground">
              {summary.average!.toFixed(1)} / 5 · {summary.count} review{summary.count === 1 ? "" : "s"}
            </p>
          )}
          {product.brand && (
            <p className="text-sm text-muted-foreground">Brand: {product.brand}</p>
          )}
          {product.description && <p className="text-sm">{product.description}</p>}

          {product.variants.length > 0 && (
            <VariantPicker
              slug={slug}
              variants={product.variants.map((v) => ({
                id: v.id,
                attributes: v.attributes,
                price: Number(v.price),
                stockQty: v.stockQty,
              }))}
              loggedIn={!!session}
            />
          )}

          {session && <WishlistButton productId={product.id} initiallyWishlisted={wishlisted} />}
        </div>
      </div>

      {coPurchased.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Customers also bought</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {coPurchased.map((p) => (
              <ProductCard
                key={p.id}
                product={{
                  slug: p.slug,
                  name: p.name,
                  images: p.images,
                  variants: p.variants,
                  seller: p.seller,
                }}
              />
            ))}
          </div>
        </div>
      )}

      <ProductReviews summary={summary} reviews={reviews} />
    </div>
  );
}
