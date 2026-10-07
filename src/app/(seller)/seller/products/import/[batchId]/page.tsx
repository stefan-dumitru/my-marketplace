import { requireApprovedSellerPage } from "@/lib/page-guards";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getImportBatch } from "@/server/services/product-import-service";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

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

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  skipped: "Skipped",
  failed: "Failed",
  deactivated: "Deactivated",
};

type Props = {
  params: Promise<{ batchId: string }>;
};

export default async function ImportBatchDetailPage({ params }: Props) {
  const { profile } = await requireApprovedSellerPage();

  const { batchId } = await params;
  const batch = await getImportBatch(profile.id, batchId);
  if (!batch) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{MODE_LABEL[batch.mode] ?? batch.mode} import</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(batch.startedAt).toLocaleString("ro-RO")} · {STATUS_LABEL[batch.status] ?? batch.status}
        </p>
      </div>

      <Card className="flex gap-6 p-4 text-sm">
        <p>
          <span className="font-medium">{batch.totalRows}</span> total
        </p>
        <p>
          <span className="font-medium">{batch.succeededRows}</span> succeeded
        </p>
        <p>
          <span className="font-medium">{batch.failedRows}</span> failed
        </p>
      </Card>

      {batch.records.length === 0 ? (
        batch.status === "pending" || batch.status === "processing" ? (
          <Card className="flex flex-col items-start gap-3 p-6 text-sm text-muted-foreground">
            <p>Your import is still processing — this can take a moment for larger files.</p>
            <Link href={`/seller/products/import/${batchId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Refresh
            </Link>
          </Card>
        ) : (
          <Card className="p-6 text-sm text-muted-foreground">No rows recorded.</Card>
        )
      ) : (
        <div className="flex flex-col gap-2">
          {batch.records.map((record) => (
            <Card key={record.id} className="flex flex-col gap-1 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{record.sku}</span>
                <span className="text-muted-foreground">{ACTION_LABEL[record.action] ?? record.action}</span>
              </div>
              {record.errorMessage && <p className="text-xs text-destructive">{record.errorMessage}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
