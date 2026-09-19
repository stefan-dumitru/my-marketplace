"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { importProductsAction } from "@/app/(seller)/seller/products/import/actions";

const MODE_OPTIONS = [
  {
    value: "add_only",
    label: "Add only",
    description: "Creates new SKUs from the file; SKUs that already exist in your catalog are left untouched.",
  },
  {
    value: "full_replace",
    label: "Full replace",
    description:
      "Treats the file as your complete active catalog: creates/updates every SKU in the file, and deactivates any of your active products not present in the file.",
  },
  {
    value: "attribute_update",
    label: "Attribute update",
    description: "Updates price and stock on existing SKUs matched by SKU only — never creates new products or deactivates anything.",
  },
];

export function ImportForm() {
  const router = useRouter();
  const [mode, setMode] = useState("add_only");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = MODE_OPTIONS.find((m) => m.value === mode)!;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setFormError("Choose a CSV file to upload.");
      return;
    }

    const formData = new FormData();
    formData.set("mode", mode);
    formData.set("file", file);

    setIsPending(true);
    const result = await importProductsAction(formData);
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.formError);
      return;
    }
    router.push(`/seller/products/import/${result.batchId}`);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border border-border p-4" noValidate>
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mode">Import mode</Label>
        <select
          id="mode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="h-8 w-fit min-w-56 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {MODE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{selected.description}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="file">CSV file</Label>
        <input id="file" ref={fileInputRef} type="file" accept=".csv,text/csv" className="text-sm" />
        <p className="text-xs text-muted-foreground">Max 100 rows, 2MB.</p>
      </div>

      <Button type="submit" size="sm" disabled={isPending} className="self-start">
        {isPending ? "Importing…" : "Import"}
      </Button>
    </form>
  );
}
