import { listAuditLogEntries } from "@/server/data/audit-log";
import { Card } from "@/components/ui/card";

const ACTION_LABEL: Record<string, string> = {
  seller_approved: "Seller approved",
  seller_rejected: "Seller rejected",
  seller_suspended: "Seller suspended",
  seller_reinstated: "Seller reinstated",
  seller_commission_updated: "Seller commission updated",
  category_commission_updated: "Category commission updated",
  product_approved: "Product approved",
  product_rejected: "Product rejected",
  review_approved: "Review approved",
  review_rejected: "Review rejected",
  payout_released: "Payout released",
  seller_order_shipped: "Order shipped",
  seller_order_delivered: "Order delivered",
  seller_order_cancelled: "Order cancelled",
  seller_order_refunded: "Order refunded",
  payment_succeeded: "Payment succeeded",
  payment_failed: "Payment failed",
};

export default async function AdminAuditLogPage() {
  const entries = await listAuditLogEntries();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Audit log</h1>

      {entries.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No audit log entries yet.</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <Card key={entry.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-medium">{ACTION_LABEL[entry.action] ?? entry.action}</p>
                <p className="text-muted-foreground">
                  {entry.entityType} · {entry.entityId}
                </p>
              </div>
              <div className="text-right text-muted-foreground">
                <p>{entry.actor ? `${entry.actor.name} (${entry.actor.email})` : "System"}</p>
                <p>{new Date(entry.createdAt).toLocaleString("ro-RO")}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
