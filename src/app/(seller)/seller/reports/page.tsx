import Link from "next/link";
import { getSellerContext } from "@/server/services/seller-service";
import { getSellerSalesReport } from "@/server/services/report-service";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { StatTile } from "@/components/dashboard/StatTile";
import { formatPrice } from "@/lib/format";
import type { ReportRange } from "@/server/data/reports";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

const RANGE_LABEL: Record<ReportRange, string> = {
  this_month: "This month",
  last_30_days: "Last 30 days",
  all: "All time",
};

type Props = {
  searchParams: Promise<{ range?: string }>;
};

export default async function SellerSalesReportPage({ searchParams }: Props) {
  // Non-null: the (seller) layout already redirected away any non-approved seller.
  const context = await getSellerContext();
  const profile = context!.profile!;

  const { range: rangeParam } = await searchParams;
  const range: ReportRange =
    rangeParam === "this_month" || rangeParam === "last_30_days" ? rangeParam : "all";

  const { rows, summary } = await getSellerSalesReport(profile.id, range);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sales report</h1>
        <a href={`/api/seller/reports/sales?range=${range}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Download CSV
        </a>
      </div>

      <div className="flex gap-2">
        {(Object.keys(RANGE_LABEL) as ReportRange[]).map((r) => (
          <Link
            key={r}
            href={`/seller/reports?range=${r}`}
            className={buttonVariants({ variant: r === range ? "default" : "outline", size: "sm" })}
          >
            {RANGE_LABEL[r]}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Orders" value={summary.orderCount} />
        <StatTile label="Subtotal" value={formatPrice(summary.totalSubtotal)} />
        <StatTile label="Commission" value={formatPrice(summary.totalCommission)} />
        <StatTile label="Payout" value={formatPrice(summary.totalPayout)} />
      </div>

      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No orders in this range.</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <Card key={row.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-medium">{row.order.orderNumber}</p>
                <p className="text-muted-foreground">
                  {new Date(row.order.createdAt).toLocaleDateString("ro-RO")} ·{" "}
                  {STATUS_LABEL[row.status] ?? row.status}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatPrice(row.subtotal)}</p>
                <p className="text-muted-foreground">Payout: {formatPrice(row.payoutAmount)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
