import { requireSellerForRoute } from "@/lib/route-auth";
import { getSellerSalesReport } from "@/server/services/report-service";
import { toCsv } from "@/lib/csv";
import type { ReportRange } from "@/server/data/reports";

const VALID_RANGES: ReportRange[] = ["this_month", "last_30_days", "all"];

export async function GET(req: Request) {
  const ctx = await requireSellerForRoute();
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const rangeParam = url.searchParams.get("range");
  const range: ReportRange = VALID_RANGES.includes(rangeParam as ReportRange)
    ? (rangeParam as ReportRange)
    : "all";

  const { rows } = await getSellerSalesReport(ctx.sellerId, range);

  // Plain numeric values, not currency-formatted strings — a CSV opened in a spreadsheet should
  // be sum/formula-friendly, not pre-formatted for display.
  const csv = toCsv(
    rows.map((r) => ({
      orderNumber: r.order.orderNumber,
      date: r.order.createdAt.toISOString(),
      status: r.status,
      subtotal: r.subtotal.toString(),
      commission: r.commissionAmount.toString(),
      payout: r.payoutAmount.toString(),
      shippedAt: r.shippedAt?.toISOString() ?? "",
      deliveredAt: r.deliveredAt?.toISOString() ?? "",
    })),
    [
      { key: "orderNumber", header: "Order Number" },
      { key: "date", header: "Date" },
      { key: "status", header: "Status" },
      { key: "subtotal", header: "Subtotal" },
      { key: "commission", header: "Commission" },
      { key: "payout", header: "Payout" },
      { key: "shippedAt", header: "Shipped At" },
      { key: "deliveredAt", header: "Delivered At" },
    ]
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-report-${range}.csv"`,
    },
  });
}
