import { requireSellerForRoute } from "@/lib/route-auth";
import { getSellerPayoutHistory } from "@/server/services/report-service";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const ctx = await requireSellerForRoute();
  if (ctx instanceof Response) return ctx;

  const rows = await getSellerPayoutHistory(ctx.sellerId);

  const csv = toCsv(
    rows.map((r) => ({
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      amount: r.amount.toString(),
      status: r.status,
      paidAt: r.paidAt?.toISOString() ?? "",
      stripeTransferId: r.stripeTransferId ?? "",
    })),
    [
      { key: "periodStart", header: "Period Start" },
      { key: "periodEnd", header: "Period End" },
      { key: "amount", header: "Amount" },
      { key: "status", header: "Status" },
      { key: "paidAt", header: "Paid At" },
      { key: "stripeTransferId", header: "Stripe Transfer ID" },
    ]
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payout-history.csv"`,
    },
  });
}
