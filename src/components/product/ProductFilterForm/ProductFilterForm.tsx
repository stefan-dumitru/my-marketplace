"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  categories: { id: string; name: string; slug: string }[];
  q?: string;
  category?: string;
};

// Plain GET form — a real page navigation re-rendered server-side from searchParams, not a
// client fetch, so no debounce (performance.md's debounce guidance targets as-you-type API
// calls, which this deliberately isn't). The category picker is a native <select>, not the
// Base UI ui/select.tsx component — that widget has no real <select> underneath, so making it
// drive a GET form would need a hidden input synced by extra client JS just to reinvent what
// name="category" already gives for free.
export function ProductFilterForm({ categories, q, category }: Props) {
  return (
    <form method="get" className="mb-6 flex flex-wrap gap-2">
      <Input
        name="q"
        defaultValue={q ?? ""}
        placeholder="Search products…"
        className="max-w-xs"
      />
      <select
        name="category"
        defaultValue={category ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" size="sm">
        Search
      </Button>
    </form>
  );
}
