"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";
import { removeCartItemAction, updateCartItemQuantityAction } from "@/app/(storefront)/cart/actions";

type Props = {
  item: {
    id: string;
    quantity: number;
    productVariant: {
      price: unknown;
      stockQty: number;
      product: { name: string; slug: string; images: string[] };
    };
  };
};

export function CartItemRow({ item }: Props) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [isPending, startTransition] = useTransition();
  const { product, price, stockQty } = item.productVariant;
  const image = product.images[0];
  const exceedsStock = item.quantity > stockQty;

  const handleQuantityChange = (next: number) => {
    if (next < 1) return;
    setQuantity(next);
    startTransition(async () => {
      await updateCartItemQuantityAction({ cartItemId: item.id, quantity: next });
    });
  };

  const handleRemove = () => {
    startTransition(async () => {
      await removeCartItemAction({ cartItemId: item.id });
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="relative h-16 w-16 shrink-0 bg-muted">
        {image && <Image src={image} alt={product.name} fill sizes="64px" className="object-cover" />}
      </div>

      <div className="min-w-32 flex-1">
        <Link href={`/products/${product.slug}`} className="text-sm font-medium hover:underline">
          {product.name}
        </Link>
        {exceedsStock && (
          <p className="text-sm text-destructive">
            Only {stockQty} left in stock — quantity will be adjusted at checkout.
          </p>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Input
          type="number"
          aria-label={`Quantity for ${product.name}`}
          min={1}
          max={stockQty}
          value={quantity}
          onChange={(e) => handleQuantityChange(Number(e.target.value))}
          disabled={isPending}
          className="w-16"
        />
        <p className="w-24 text-right text-sm font-medium">{formatPrice(price)}</p>
        <Button variant="ghost" size="sm" disabled={isPending} onClick={handleRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}
