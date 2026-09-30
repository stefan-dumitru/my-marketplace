import Link from "next/link";
import Image from "next/image";
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
  /** Set for above-the-fold cards only (see callers) — preloads with fetchpriority=high instead
   *  of the default lazy-load. */
  priority?: boolean;
};

export function ProductCard({ product, priority }: Props) {
  const price = product.variants[0]?.price;
  const image = product.images[0];

  return (
    <Link href={`/products/${product.slug}`}>
      <Card className="flex h-full flex-col gap-2 overflow-hidden p-0">
        <div className="relative aspect-square w-full bg-muted">
          {image && (
            <Image
              src={image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              priority={priority}
              className="object-cover"
            />
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
