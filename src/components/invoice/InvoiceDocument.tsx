import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  h1: { fontSize: 18, marginBottom: 4 },
  muted: { color: "#666666" },
  section: { marginTop: 16 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  sellerBlock: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#dddddd" },
  sellerName: { fontSize: 12, fontWeight: 700, marginBottom: 4 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 20, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#000000" },
  totalLabel: { fontSize: 12, fontWeight: 700 },
});

type InvoiceOrder = {
  orderNumber: string;
  createdAt: Date;
  totalAmount: unknown;
  discountAmount: unknown;
  shippingAmount: unknown;
  couponCodeSnapshot: string | null;
  shippingAddressSnapshot: unknown;
  sellerOrders: {
    id: string;
    subtotal: unknown;
    seller: { storeName: string };
    items: { productNameSnapshot: string; quantity: number; unitPriceSnapshot: unknown; lineTotal: unknown }[];
  }[];
  payment: { status: string; paidAt: Date | null } | null;
};

function formatAmount(value: unknown): string {
  return `${Number(value).toFixed(2)} RON`;
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  succeeded: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

export function InvoiceDocument({
  order,
  buyerName,
  buyerEmail,
}: {
  order: InvoiceOrder;
  buyerName: string;
  buyerEmail: string;
}) {
  const address = order.shippingAddressSnapshot as {
    recipientName: string;
    line1: string;
    line2?: string;
    city: string;
    county: string;
    postalCode: string;
    country: string;
    phone: string;
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Invoice</Text>
        <Text style={styles.muted}>Order {order.orderNumber}</Text>
        <Text style={styles.muted}>{new Date(order.createdAt).toLocaleDateString("ro-RO")}</Text>

        <View style={styles.section}>
          <View style={styles.row}>
            <View>
              <Text>{buyerName}</Text>
              <Text style={styles.muted}>{buyerEmail}</Text>
            </View>
            <View>
              <Text>{address.recipientName}</Text>
              <Text>{address.line1}{address.line2 ? `, ${address.line2}` : ""}</Text>
              <Text>{address.city}, {address.county} {address.postalCode}</Text>
              <Text>{address.country}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text>
            Payment: {order.payment ? PAYMENT_STATUS_LABEL[order.payment.status] ?? order.payment.status : "N/A"}
            {order.payment?.paidAt ? ` (${new Date(order.payment.paidAt).toLocaleDateString("ro-RO")})` : ""}
          </Text>
        </View>

        {order.sellerOrders.map((sellerOrder) => (
          <View key={sellerOrder.id} style={styles.sellerBlock}>
            <Text style={styles.sellerName}>{sellerOrder.seller.storeName}</Text>
            {sellerOrder.items.map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <Text>{item.productNameSnapshot} × {item.quantity}</Text>
                <Text>{formatAmount(item.lineTotal)}</Text>
              </View>
            ))}
            <View style={styles.itemRow}>
              <Text style={{ fontWeight: 700 }}>Subtotal</Text>
              <Text style={{ fontWeight: 700 }}>{formatAmount(sellerOrder.subtotal)}</Text>
            </View>
          </View>
        ))}

        {Number(order.shippingAmount) > 0 && (
          <View style={styles.itemRow}>
            <Text>Shipping</Text>
            <Text>{formatAmount(order.shippingAmount)}</Text>
          </View>
        )}

        {Number(order.discountAmount) > 0 && (
          <View style={styles.itemRow}>
            <Text>Discount{order.couponCodeSnapshot ? ` (${order.couponCodeSnapshot})` : ""}</Text>
            <Text>-{formatAmount(order.discountAmount)}</Text>
          </View>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalLabel}>{formatAmount(order.totalAmount)}</Text>
        </View>
      </Page>
    </Document>
  );
}
