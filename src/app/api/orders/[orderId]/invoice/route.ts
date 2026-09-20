import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { getOrderByIdForBuyer } from "@/server/data/orders";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";

type Props = {
  params: Promise<{ orderId: string }>;
};

export async function GET(_req: Request, { params }: Props) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { orderId } = await params;
  const order = await getOrderByIdForBuyer(session.user.id, orderId);
  if (!order) return new Response("Not found", { status: 404 });

  const buffer = await renderToBuffer(
    InvoiceDocument({
      order,
      buyerName: session.user.name ?? "",
      buyerEmail: session.user.email ?? "",
    })
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${order.orderNumber}.pdf"`,
    },
  });
}
