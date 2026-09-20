import { requireSellerForRoute } from "@/lib/route-auth";
import { getSellerPayoutHistory } from "@/server/services/report-service";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const ctx = await requireSellerForRoute();
  if (ctx instanceof Response) return ctx;

  const rows = await getSellerPayoutHistory(ctx.sellerId);

  const csv = toCsv(
    rows.map((r) => ({
      orderNumber: r.order.orderNumber,
      deliveredAt: r.deliveredAt?.toISOString() ?? "",
      payoutAmount: r.payoutAmount.toString(),
      payoutStatus: r.payoutAt ? "Paid" : "Pending",
      payoutAt: r.payoutAt?.toISOString() ?? "",
      stripeTransferId: r.stripeTransferId ?? "",
    })),
    [
      { key: "orderNumber", header: "Order Number" },
      { key: "deliveredAt", header: "Delivered At" },
      { key: "payoutAmount", header: "Payout Amount" },
      { key: "payoutStatus", header: "Payout Status" },
      { key: "payoutAt", header: "Payout Date" },
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
