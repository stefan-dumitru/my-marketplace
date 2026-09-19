"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AddToCartForm } from "@/components/product/AddToCartForm";

type Variant = {
  id: string;
  attributes: unknown;
  price: unknown;
  stockQty: number;
};

type Props = {
  slug: string;
  variants: Variant[];
  loggedIn: boolean;
};

function asAttributes(value: unknown): Record<string, string> {
  return value && typeof value === "object" ? (value as Record<string, string>) : {};
}

export function VariantPicker({ slug, variants, loggedIn }: Props) {
  // Stable key order: first-occurrence across variants, not alphabetical — keeps the picker's
  // select order predictable and matching however the seller entered attributes.
  const attributeKeys = useMemo(() => {
    const keys: string[] = [];
    for (const v of variants) {
      for (const key of Object.keys(asAttributes(v.attributes))) {
        if (!keys.includes(key)) keys.push(key);
      }
    }
    return keys;
  }, [variants]);

  const valuesByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const key of attributeKeys) {
      const values: string[] = [];
      for (const v of variants) {
        const value = asAttributes(v.attributes)[key];
        if (value && !values.includes(value)) values.push(value);
      }
      map[key] = values;
    }
    return map;
  }, [attributeKeys, variants]);

  // Defaults to the first available value per key (not variants[0]'s own attributes — that
  // variant may be the attribute-less "default" row from before this product had real variants,
  // which would otherwise seed an initial selection that matches no option in its own dropdown).
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(attributeKeys.map((k) => [k, valuesByKey[k]?.[0] ?? ""]))
  );

  const matchedVariant = useMemo(() => {
    if (attributeKeys.length === 0) return variants[0];
    return variants.find((v) => {
      const attrs = asAttributes(v.attributes);
      return attributeKeys.every((key) => attrs[key] === selected[key]);
    });
  }, [attributeKeys, selected, variants]);

  return (
    <div className="flex flex-col gap-3">
      {attributeKeys.map((key) => (
        <div key={key} className="flex flex-col gap-1.5">
          <Label htmlFor={`variant-${key}`}>{key}</Label>
          <select
            id={`variant-${key}`}
            value={selected[key] ?? ""}
            onChange={(e) => setSelected((prev) => ({ ...prev, [key]: e.target.value }))}
            className="h-8 w-fit min-w-32 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {valuesByKey[key]?.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      ))}

      {matchedVariant ? (
        <>
          <p className="text-xl font-semibold">{formatPrice(matchedVariant.price)}</p>
          <p className="text-sm text-muted-foreground">
            {matchedVariant.stockQty > 0 ? `${matchedVariant.stockQty} in stock` : "Out of stock"}
          </p>

          {loggedIn ? (
            <AddToCartForm
              key={matchedVariant.id}
              productVariantId={matchedVariant.id}
              stockQty={matchedVariant.stockQty}
            />
          ) : (
            <Link
              href={`/auth/login?callbackUrl=/products/${slug}`}
              className={buttonVariants({ className: "w-fit" })}
            >
              Log in to buy
            </Link>
          )}
        </>
      ) : (
        <p className="text-sm font-medium text-destructive">This combination is currently unavailable.</p>
      )}
    </div>
  );
}
