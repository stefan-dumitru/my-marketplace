import { parseSpecifications } from "@/lib/product-specs";

export function ProductSpecifications({ specifications }: { specifications: unknown }) {
  const rows = parseSpecifications(specifications);
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="specs-heading" className="flex flex-col gap-3">
      <h2 id="specs-heading" className="text-lg font-semibold">
        Technical specifications
      </h2>
      <dl className="divide-y rounded-lg border text-sm">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[2fr_3fr] gap-4 px-4 py-2.5 odd:bg-muted/40">
            <dt className="font-medium">{row.label}</dt>
            <dd className="text-muted-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
