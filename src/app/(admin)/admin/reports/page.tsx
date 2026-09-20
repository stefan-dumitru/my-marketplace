import Link from "next/link";
import { getPlatformRevenueReport } from "@/server/services/report-service";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { StatTile } from "@/components/dashboard/StatTile";
import { formatPrice } from "@/lib/format";
import type { ReportRange } from "@/server/data/reports";

const RANGE_LABEL: Record<ReportRange, string> = {
  this_month: "This month",
  last_30_days: "Last 30 days",
  all: "All time",
};

type Props = {
  searchParams: Promise<{ range?: string }>;
};

export default async function AdminReportsPage({ searchParams }: Props) {
  const { range: rangeParam } = await searchParams;
  const range: ReportRange =
    rangeParam === "this_month" || rangeParam === "last_30_days" ? rangeParam : "all";

  const { rows, totals } = await getPlatformRevenueReport(range);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Revenue & commission report</h1>
        <a href={`/api/admin/reports/revenue?range=${range}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Download CSV
        </a>
      </div>

      <div className="flex gap-2">
        {(Object.keys(RANGE_LABEL) as ReportRange[]).map((r) => (
          <Link
            key={r}
            href={`/admin/reports?range=${r}`}
            className={buttonVariants({ variant: r === range ? "default" : "outline", size: "sm" })}
          >
            {RANGE_LABEL[r]}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Orders" value={totals.orderCount} />
        <StatTile label="Subtotal (GMV)" value={formatPrice(totals.totalSubtotal)} />
        <StatTile label="Commission" value={formatPrice(totals.totalCommission)} />
        <StatTile label="Payout" value={formatPrice(totals.totalPayout)} />
      </div>

      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No orders in this range.</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <Card key={row.sellerId} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-medium">{row.storeName}</p>
                <p className="text-muted-foreground">{row.orderCount} orders</p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatPrice(row.totalSubtotal)}</p>
                <p className="text-muted-foreground">
                  Commission: {formatPrice(row.totalCommission)} · Payout: {formatPrice(row.totalPayout)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
