import { requireAdminForRoute } from "@/lib/route-auth";
import { getPlatformRevenueReport } from "@/server/services/report-service";
import { toCsv } from "@/lib/csv";
import type { ReportRange } from "@/server/data/reports";

const VALID_RANGES: ReportRange[] = ["this_month", "last_30_days", "all"];

export async function GET(req: Request) {
  const ctx = await requireAdminForRoute();
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const rangeParam = url.searchParams.get("range");
  const range: ReportRange = VALID_RANGES.includes(rangeParam as ReportRange)
    ? (rangeParam as ReportRange)
    : "all";

  const { rows } = await getPlatformRevenueReport(range);

  const csv = toCsv(
    rows.map((r) => ({
      storeName: r.storeName,
      orderCount: r.orderCount,
      subtotal: r.totalSubtotal.toString(),
      commission: r.totalCommission.toString(),
      payout: r.totalPayout.toString(),
    })),
    [
      { key: "storeName", header: "Seller" },
      { key: "orderCount", header: "Order Count" },
      { key: "subtotal", header: "Subtotal" },
      { key: "commission", header: "Commission" },
      { key: "payout", header: "Payout" },
    ]
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="revenue-report-${range}.csv"`,
    },
  });
}
