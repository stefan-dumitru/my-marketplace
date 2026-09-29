"use client";

import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import {
  moveWishlistItemToCartAction,
  removeFromWishlistAction,
} from "@/app/(storefront)/account/wishlist/actions";

type Props = {
  item: {
    product: {
      id: string;
      slug: string;
      name: string;
      images: string[];
      status: string;
      variants: { id: string; price: unknown; stockQty: number }[];
    };
  };
};

function SubmitButton({ children, variant }: { children: React.ReactNode; variant?: "outline" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant ?? "default"} size="sm" disabled={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

export function WishlistItemRow({ item }: Props) {
  const { product } = item;
  const variant = product.variants[0];
  const image = product.images[0];
  const available = product.status === "active" && !!variant && variant.stockQty > 0;

  return (
    <Card className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div>
          <Link href={`/products/${product.slug}`} className="font-medium hover:underline">
            {product.name}
          </Link>
          {available && variant ? (
            <p className="text-muted-foreground">{formatPrice(variant.price as number)}</p>
          ) : (
            <p className="text-destructive">No longer available</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {available && variant && (
          <form
            action={async () => {
              await moveWishlistItemToCartAction(product.id, { productVariantId: variant.id, quantity: 1 });
            }}
          >
            <SubmitButton>Move to cart</SubmitButton>
          </form>
        )}
        <form
          action={async () => {
            await removeFromWishlistAction(product.id);
          }}
        >
          <SubmitButton variant="outline">Remove</SubmitButton>
        </form>
      </div>
    </Card>
  );
}
