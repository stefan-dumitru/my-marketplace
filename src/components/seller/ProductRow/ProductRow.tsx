"use client";

import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { toggleProductStatusAction } from "@/app/(seller)/seller/actions";

type Props = {
  product: {
    id: string;
    name: string;
    sku: string;
    status: string;
    category: { name: string };
    variants: { price: unknown; stockQty: number }[];
  };
};

function ToggleButton({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={active ? "outline" : "default"} size="sm" disabled={pending}>
      {pending ? "Working…" : active ? "Deactivate" : "Activate"}
    </Button>
  );
}

export function ProductRow({ product }: Props) {
  const isActive = product.status === "active";
  const variant = product.variants[0];

  return (
    <Card className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{product.name}</p>
        <p className="text-muted-foreground">
          {product.category.name} · SKU {product.sku}
        </p>
        <p className={isActive ? "text-emerald-600" : "text-muted-foreground"}>
          {isActive ? "Active" : "Inactive"}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-medium">{variant ? formatPrice(variant.price) : "—"}</p>
          <p className="text-muted-foreground">{variant?.stockQty ?? 0} in stock</p>
        </div>
        <Link
          href={`/seller/products/${product.id}/edit`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Edit
        </Link>
        <form
          action={async () => {
            await toggleProductStatusAction(product.id, !isActive);
          }}
        >
          <ToggleButton active={isActive} />
        </form>
      </div>
    </Card>
  );
}
