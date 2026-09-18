"use client";

import { useFormStatus } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { approveProductAction, rejectProductAction } from "@/app/(admin)/admin/products/actions";

type Props = {
  product: {
    id: string;
    name: string;
    sku: string;
    seller: { storeName: string };
    category: { name: string };
    variants: { price: unknown }[];
  };
};

function SubmitButton({ variant, children }: { variant: "default" | "outline"; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" disabled={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

export function ProductModerationRow({ product }: Props) {
  const variant = product.variants[0];

  return (
    <Card className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{product.name}</p>
        <p className="text-muted-foreground">
          {product.seller.storeName} · {product.category.name} · SKU {product.sku}
        </p>
        {variant && <p className="text-muted-foreground">{formatPrice(variant.price)}</p>}
      </div>
      <div className="flex gap-2">
        <form action={async () => { await approveProductAction(product.id); }}>
          <SubmitButton variant="default">Approve</SubmitButton>
        </form>
        <form action={async () => { await rejectProductAction(product.id); }}>
          <SubmitButton variant="outline">Reject</SubmitButton>
        </form>
      </div>
    </Card>
  );
}
