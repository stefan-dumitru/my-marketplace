import { requireApprovedSellerPage } from "@/lib/page-guards";
import Link from "next/link";
import { getImportBatches } from "@/server/services/product-import-service";
import { Card } from "@/components/ui/card";
import { ImportForm } from "@/components/seller/ImportForm";
import { Pagination } from "@/components/shared/Pagination";
import { parsePage } from "@/lib/pagination";

const MODE_LABEL: Record<string, string> = {
  add_only: "Add only",
  full_replace: "Full replace",
  attribute_update: "Attribute update",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function ImportProductsPage({ searchParams }: Props) {
  const { profile } = await requireApprovedSellerPage("/seller/products/import");

  const page = parsePage((await searchParams).page);
  const { batches, hasNextPage } = await getImportBatches(profile.id, page);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Import products</h1>
        <p className="text-sm text-muted-foreground">Bulk create or update your catalog via CSV.</p>
      </div>

      <ImportForm />

      <div>
        <h2 className="mb-2 text-lg font-medium">Past imports</h2>
        {batches.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No imports yet.</Card>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {batches.map((batch) => (
                <Link key={batch.id} href={`/seller/products/import/${batch.id}`}>
                  <Card className="flex flex-col gap-1 p-4 text-sm hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{MODE_LABEL[batch.mode] ?? batch.mode}</p>
                      <p className="text-muted-foreground">
                        {new Date(batch.startedAt).toLocaleString("ro-RO")}
                      </p>
                    </div>
                    <p className="text-muted-foreground">
                      {STATUS_LABEL[batch.status] ?? batch.status} · {batch.succeededRows}/{batch.totalRows} succeeded
                      {batch.failedRows > 0 ? `, ${batch.failedRows} failed` : ""}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
            <Pagination page={page} hasNextPage={hasNextPage} basePath="/seller/products/import" />
          </>
        )}
      </div>
    </div>
  );
}
