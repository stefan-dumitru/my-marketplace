import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductForStorefront } from "@/server/services/product-service";
import { getProductReviews } from "@/server/services/review-service";
import { formatPrice } from "@/lib/format";
import { auth } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { AddToCartForm } from "@/components/product/AddToCartForm";
import { ProductReviews } from "@/components/review/ProductReviews";

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

  const { reviews, summary } = await getProductReviews(product.id);

  const variant = product.variants[0];
  const image = product.images[0];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-10">
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="aspect-square w-full bg-muted">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={product.name} className="h-full w-full object-cover" />
          )}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{product.category.name}</p>
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <p className="text-sm text-muted-foreground">Sold by {product.seller.storeName}</p>
          {variant && <p className="text-xl font-semibold">{formatPrice(variant.price)}</p>}
          {summary.count > 0 && (
            <p className="text-sm text-muted-foreground">
              {summary.average!.toFixed(1)} / 5 · {summary.count} review{summary.count === 1 ? "" : "s"}
            </p>
          )}
          {product.brand && (
            <p className="text-sm text-muted-foreground">Brand: {product.brand}</p>
          )}
          {product.description && <p className="text-sm">{product.description}</p>}
          {variant && (
            <p className="text-sm text-muted-foreground">
              {variant.stockQty > 0 ? `${variant.stockQty} in stock` : "Out of stock"}
            </p>
          )}

          {variant &&
            (session ? (
              <AddToCartForm productVariantId={variant.id} stockQty={variant.stockQty} />
            ) : (
              <Link
                href={`/auth/login?callbackUrl=/products/${slug}`}
                className={buttonVariants({ className: "w-fit" })}
              >
                Log in to buy
              </Link>
            ))}
        </div>
      </div>

      <ProductReviews summary={summary} reviews={reviews} />
    </div>
  );
}
