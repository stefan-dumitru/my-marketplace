import { notFound } from "next/navigation";
import { getProductForStorefront } from "@/server/services/product-service";
import { formatPrice } from "@/lib/format";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductForStorefront(slug);
  if (!product) notFound();

  const variant = product.variants[0];
  const image = product.images[0];

  return (
    <div className="mx-auto grid w-full max-w-4xl flex-1 gap-8 px-4 py-10 sm:grid-cols-2">
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
        {product.brand && (
          <p className="text-sm text-muted-foreground">Brand: {product.brand}</p>
        )}
        {product.description && <p className="text-sm">{product.description}</p>}
        {variant && (
          <p className="text-sm text-muted-foreground">
            {variant.stockQty > 0 ? `${variant.stockQty} in stock` : "Out of stock"}
          </p>
        )}
      </div>
    </div>
  );
}
