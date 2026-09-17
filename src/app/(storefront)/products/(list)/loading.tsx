import { Card } from "@/components/ui/card";

export default function ProductsLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="mb-6 flex gap-2">
        <div className="h-8 w-full max-w-xs animate-pulse rounded-lg bg-muted" />
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="overflow-hidden p-0">
            <div className="aspect-square w-full animate-pulse bg-muted" />
            <div className="flex flex-col gap-2 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
