import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/format";

type Props = {
  product: {
    slug: string;
    name: string;
    images: string[];
    variants: { price: unknown }[];
    seller: { storeName: string };
  };
};

export function ProductCard({ product }: Props) {
  const price = product.variants[0]?.price;
  const image = product.images[0];

  return (
    <Link href={`/products/${product.slug}`}>
      <Card className="flex h-full flex-col gap-2 overflow-hidden p-0">
        <div className="aspect-square w-full bg-muted">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={product.name} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex flex-col gap-1 p-3">
          <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
          <p className="text-xs text-muted-foreground">{product.seller.storeName}</p>
          {price !== undefined && <p className="text-sm font-semibold">{formatPrice(price as number)}</p>}
        </div>
      </Card>
    </Link>
  );
}
