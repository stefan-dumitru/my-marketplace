"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";

type Suggestions = {
  products: { id: string; slug: string; name: string; image: string | null; minPrice: number | null }[];
  categories: { slug: string; name: string }[];
  brands: string[];
};

type Option = { key: string; label: string; href: string; kind: "product" | "category" | "brand" | "all"; product?: Suggestions["products"][number] };

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;

/**
 * Search box with as-you-type suggestions. Sits inside the existing GET filter form, so with JS
 * off (or no suggestion highlighted) Enter still submits a normal /products?q=… navigation — the
 * suggestions are pure enhancement on top of it. Talks only to our own /api/search/suggest; the
 * browser never contacts the search engine directly.
 */
export function SearchAutocomplete({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < MIN_CHARS) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (!res.ok) return;
        setSuggestions((await res.json()) as Suggestions);
        setActiveIndex(-1);
      } catch {
        // Aborted by a newer keystroke, or the network dropped — suggestions just don't update.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  const enc = encodeURIComponent(trimmed);
  const options: Option[] =
    trimmed.length >= MIN_CHARS && suggestions
      ? [
          ...suggestions.products.map((p): Option => ({ key: `p-${p.id}`, label: p.name, href: `/products/${p.slug}`, kind: "product", product: p })),
          ...suggestions.categories.map((c): Option => ({ key: `c-${c.slug}`, label: `${trimmed} in ${c.name}`, href: `/products?q=${enc}&category=${encodeURIComponent(c.slug)}`, kind: "category" })),
          ...suggestions.brands.map((b): Option => ({ key: `b-${b}`, label: `${trimmed} by ${b}`, href: `/products?q=${enc}&brand=${encodeURIComponent(b)}`, kind: "brand" })),
          ...(suggestions.products.length > 0 ? [{ key: "all", label: `See all results for “${trimmed}”`, href: `/products?q=${enc}`, kind: "all" } as Option] : []),
        ]
      : [];
  const showList = open && options.length > 0;

  function go(option: Option) {
    setOpen(false);
    router.push(option.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      go(options[activeIndex]);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-xs"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Input
        name="q"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // A highlight belongs to the suggestions for the *previous* text — keeping it would let Enter
          // jump to a stale item instead of submitting what was just typed.
          setActiveIndex(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search products…"
        autoComplete="off"
        role="combobox"
        aria-label="Search products"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 min-w-72 overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {options.map((option, i) => (
            <li
              key={option.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              // mousedown (not click) so the input's blur doesn't close the list before the click lands.
              onMouseDown={(e) => {
                e.preventDefault();
                go(option);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm ${i === activeIndex ? "bg-accent text-accent-foreground" : ""}`}
            >
              {option.kind === "product" && option.product ? (
                <>
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-muted">
                    {option.product.image && <Image src={option.product.image} alt="" fill sizes="36px" className="object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.product.minPrice !== null && (
                    <span className="shrink-0 text-muted-foreground">{formatPrice(option.product.minPrice)}</span>
                  )}
                </>
              ) : (
                <span className={option.kind === "all" ? "font-medium" : "text-muted-foreground"}>{option.label}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
