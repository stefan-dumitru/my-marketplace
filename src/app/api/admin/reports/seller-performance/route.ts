import { requireAdminForRoute } from "@/lib/route-auth";
import { getSellerPerformanceReport } from "@/server/services/report-service";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const ctx = await requireAdminForRoute();
  if (ctx instanceof Response) return ctx;

  const rows = await getSellerPerformanceReport();

  const csv = toCsv(
    rows.map((r) => ({
      storeName: r.storeName,
      status: r.status,
      productCount: r.productCount,
      orderCount: r.orderCount,
      totalRevenue: r.totalRevenue.toString(),
      averageRating: r.averageRating?.toFixed(2) ?? "",
      reviewCount: r.reviewCount,
      cancelledOrReturnedCount: r.cancelledOrReturnedCount,
    })),
    [
      { key: "storeName", header: "Seller" },
      { key: "status", header: "Status" },
      { key: "productCount", header: "Product Count" },
      { key: "orderCount", header: "Order Count" },
      { key: "totalRevenue", header: "Total Revenue" },
      { key: "averageRating", header: "Average Rating" },
      { key: "reviewCount", header: "Review Count" },
      { key: "cancelledOrReturnedCount", header: "Cancelled/Returned Count" },
    ]
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="seller-performance-report.csv"`,
    },
  });
}
