"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  categories: { id: string; name: string; slug: string }[];
  brands: string[];
  q?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  brand?: string;
  minRating?: string;
};

const RATING_OPTIONS = [4, 3, 2, 1];

// Plain GET form — a real page navigation re-rendered server-side from searchParams, not a
// client fetch, so no debounce (performance.md's debounce guidance targets as-you-type API
// calls, which this deliberately isn't). Every picker here is a native <select>/<input>, not the
// Base UI ui/select.tsx component — that widget has no real <select> underneath, so making it
// drive a GET form would need a hidden input synced by extra client JS just to reinvent what
// name="..." already gives for free.
export function ProductFilterForm({ categories, brands, q, category, minPrice, maxPrice, brand, minRating }: Props) {
  return (
    <form method="get" className="mb-6 flex flex-wrap items-center gap-2">
      <Input
        name="q"
        defaultValue={q ?? ""}
        placeholder="Search products…"
        className="max-w-xs"
      />
      <select
        name="category"
        aria-label="Category"
        defaultValue={category ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {/* A native <select>'s options popup is rendered by the browser/OS, not by Tailwind's
            `dark:` variant — it takes its background/text color from the <select>/<option>
            elements' own resolved colors instead. `bg-transparent` left it falling back to the
            browser's default (often white) popup background, so light-mode text became invisible
            against it in dark mode until a hover state forced a contrasting highlight. Explicit
            colors here (matching ui/select.tsx's popover tokens) fix that in both themes. */}
        <option value="" className="bg-popover text-popover-foreground">
          All categories
        </option>
        {categories.map((c) => (
          <option key={c.id} value={c.slug} className="bg-popover text-popover-foreground">
            {c.name}
          </option>
        ))}
      </select>
      <select
        name="brand"
        aria-label="Brand"
        defaultValue={brand ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="" className="bg-popover text-popover-foreground">
          All brands
        </option>
        {brands.map((b) => (
          <option key={b} value={b} className="bg-popover text-popover-foreground">
            {b}
          </option>
        ))}
      </select>
      <select
        name="minRating"
        aria-label="Minimum rating"
        defaultValue={minRating ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="" className="bg-popover text-popover-foreground">
          Any rating
        </option>
        {RATING_OPTIONS.map((r) => (
          <option key={r} value={r} className="bg-popover text-popover-foreground">
            {r}+ stars
          </option>
        ))}
      </select>
      <Input
        name="minPrice"
        type="number"
        step="0.01"
        min="0"
        defaultValue={minPrice ?? ""}
        placeholder="Min price"
        className="w-28"
      />
      <Input
        name="maxPrice"
        type="number"
        step="0.01"
        min="0"
        defaultValue={maxPrice ?? ""}
        placeholder="Max price"
        className="w-28"
      />
      <Button type="submit" variant="outline" size="sm">
        Search
      </Button>
    </form>
  );
}
