"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyCouponAction, removeCouponAction } from "@/app/(storefront)/cart/actions";

type Props = {
  /** The code currently applied to the cart, if any. */
  appliedCode?: string | null;
};

export function PromoCodeForm({ appliedCode }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const apply = () => {
    setError(null);
    startTransition(async () => {
      const result = await applyCouponAction({ code });
      if (result.ok) setCode("");
      else setError(result.formError);
    });
  };

  if (appliedCode) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
        <p>
          Code <span className="font-semibold">{appliedCode}</span> applied
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(() => removeCouponAction())}
        >
          Remove
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Promo code"
          aria-label="Promo code"
          aria-invalid={!!error}
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={64}
          className="uppercase placeholder:normal-case"
        />
        <Button type="submit" variant="outline" disabled={isPending || code.trim() === ""}>
          {isPending ? "Applying…" : "Apply"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
