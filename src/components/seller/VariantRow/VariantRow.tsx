"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { deleteVariantAction } from "@/app/(seller)/seller/products/[id]/variants/actions";

type Props = {
  productId: string;
  variant: {
    id: string;
    sku: string;
    attributes: unknown;
    price: unknown;
    stockQty: number;
  };
};

function attributesSummary(attributes: unknown): string {
  if (!attributes || typeof attributes !== "object") return "(no attributes)";
  const entries = Object.entries(attributes as Record<string, string>);
  if (entries.length === 0) return "(no attributes)";
  return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
}

export function VariantRow({ productId, variant }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleDelete = async () => {
    setIsPending(true);
    setError(null);
    const result = await deleteVariantAction(productId, variant.id);
    setIsPending(false);
    if (!result.ok) setError(result.formError);
  };

  return (
    <Card className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{attributesSummary(variant.attributes)}</p>
        <p className="text-muted-foreground">SKU {variant.sku}</p>
        {error && <p className="text-destructive">{error}</p>}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-medium">{formatPrice(variant.price)}</p>
          <p className="text-muted-foreground">{variant.stockQty} in stock</p>
        </div>
        <Link
          href={`/seller/products/${productId}/variants/${variant.id}/edit`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Edit
        </Link>
        <Button variant="outline" size="sm" onClick={handleDelete} disabled={isPending}>
          {isPending ? "Working…" : "Delete"}
        </Button>
      </div>
    </Card>
  );
}
