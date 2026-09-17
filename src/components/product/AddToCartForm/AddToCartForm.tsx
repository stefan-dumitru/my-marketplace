"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addToCartAction } from "@/app/(storefront)/cart/actions";

type Props = {
  productVariantId: string;
  stockQty: number;
};

export function AddToCartForm({ productVariantId, stockQty }: Props) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<"idle" | "adding" | "added">("idle");
  const [error, setError] = useState<string | null>(null);

  if (stockQty <= 0) {
    return <p className="text-sm font-medium text-destructive">Out of stock</p>;
  }

  const handleAdd = async () => {
    setStatus("adding");
    setError(null);
    const result = await addToCartAction({ productVariantId, quantity });
    if (!result.ok) {
      setError(result.formError);
      setStatus("idle");
      return;
    }
    setStatus("added");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={stockQty}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Math.min(stockQty, Number(e.target.value))))}
          className="w-20"
        />
        <Button onClick={handleAdd} disabled={status === "adding"}>
          {status === "adding" ? "Adding…" : status === "added" ? "Added ✓" : "Add to cart"}
        </Button>
      </div>
    </div>
  );
}
