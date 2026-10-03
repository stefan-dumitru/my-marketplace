import { requireSellerForRoute } from "@/lib/route-auth";
import { getSellerOrderForSeller } from "@/server/services/seller-order-service";
import { fetchLabelPdf } from "@/server/services/carrier-service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSellerForRoute();
  if (ctx instanceof Response) return ctx;

  const { id } = await params;
  const sellerOrder = await getSellerOrderForSeller(ctx.sellerId, id);
  if (!sellerOrder || !sellerOrder.trackingNumber || !sellerOrder.labelUrl) {
    return new Response("Not found", { status: 404 });
  }

  const result = await fetchLabelPdf(sellerOrder.trackingNumber);
  if (!result.ok) return new Response(result.error, { status: 502 });

  return new Response(result.pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-${sellerOrder.trackingNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
