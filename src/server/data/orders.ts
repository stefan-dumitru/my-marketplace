import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const ORDER_INCLUDE = {
  sellerOrders: {
    include: {
      seller: { select: { storeName: true, storeSlug: true } },
      items: true,
    },
  },
  payment: true,
} as const;

/** Internal — unwinds the transaction with enough detail to build a user-facing message. */
class CheckoutError extends Error {
  constructor(
    public reason: "product_unavailable" | "insufficient_stock",
    public productName: string,
    public available?: number
  ) {
    super(reason);
  }
}

async function generateUniqueOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    const existing = await tx.order.findUnique({ where: { orderNumber: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique order number.");
}

export type CreateOrderFromCartResult =
  | { ok: true; order: NonNullable<Awaited<ReturnType<typeof getOrderByIdForBuyer>>> }
  | { ok: false; reason: "empty_cart" }
  | { ok: false; reason: "product_unavailable"; productName: string }
  | { ok: false; reason: "insufficient_stock"; productName: string; available: number };

/**
 * The core checkout transaction: atomically decrements stock (the actual concurrency guard —
 * distinct from this codebase's ownership verify-then-update pattern, since stock is a hot,
 * concurrently-written counter, not a racy ownership check) and creates the full Order tree in
 * one interactive transaction. Stripe is deliberately NOT called from in here — never hold a DB
 * transaction open across a network call — see order-service.ts's checkoutCart for what happens
 * after this commits.
 */
export async function createOrderFromCart(input: {
  buyerId: string;
  items: { productVariantId: string; quantity: number }[];
  shippingAddressSnapshot: Prisma.InputJsonValue;
}): Promise<CreateOrderFromCartResult> {
  if (input.items.length === 0) return { ok: false, reason: "empty_cart" };

  try {
    const orderId = await prisma.$transaction(async (tx) => {
      const variantIds = input.items.map((i) => i.productVariantId);
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: {
          product: {
            include: {
              category: { select: { defaultCommissionRate: true } },
              seller: { select: { id: true, commissionRateOverride: true } },
            },
          },
        },
      });
      const variantMap = new Map(variants.map((v) => [v.id, v]));

      type ItemCompute = {
        sellerId: string;
        productVariantId: string;
        productNameSnapshot: string;
        unitPriceSnapshot: number;
        quantity: number;
        lineTotal: number;
        commissionRate: number;
      };
      const computed: ItemCompute[] = [];

      for (const cartItem of input.items) {
        const variant = variantMap.get(cartItem.productVariantId);
        if (!variant || variant.product.status !== "active") {
          throw new CheckoutError(
            "product_unavailable",
            variant?.product.name ?? "An item in your cart"
          );
        }

        // The actual concurrency guard: atomic conditional decrement, not a read-then-write.
        const decremented = await tx.productVariant.updateMany({
          where: { id: variant.id, stockQty: { gte: cartItem.quantity } },
          data: { stockQty: { decrement: cartItem.quantity } },
        });
        if (decremented.count !== 1) {
          throw new CheckoutError("insufficient_stock", variant.product.name, variant.stockQty);
        }

        const unitPrice = Number(variant.price);
        computed.push({
          sellerId: variant.product.seller.id,
          productVariantId: variant.id,
          productNameSnapshot: variant.product.name,
          unitPriceSnapshot: unitPrice,
          quantity: cartItem.quantity,
          lineTotal: unitPrice * cartItem.quantity,
          commissionRate: Number(
            variant.product.seller.commissionRateOverride ?? variant.product.category.defaultCommissionRate
          ),
        });
      }

      const bySeller = new Map<string, ItemCompute[]>();
      for (const item of computed) {
        if (!bySeller.has(item.sellerId)) bySeller.set(item.sellerId, []);
        bySeller.get(item.sellerId)!.push(item);
      }

      const sellerOrdersData = Array.from(bySeller.entries()).map(([sellerId, items]) => {
        const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
        const commissionAmount = items.reduce((sum, i) => sum + i.lineTotal * i.commissionRate, 0);
        return {
          sellerId,
          subtotal,
          commissionAmount,
          items: {
            create: items.map((i) => ({
              productVariantId: i.productVariantId,
              productNameSnapshot: i.productNameSnapshot,
              unitPriceSnapshot: i.unitPriceSnapshot,
              quantity: i.quantity,
              lineTotal: i.lineTotal,
            })),
          },
        };
      });

      const totalAmount = sellerOrdersData.reduce((sum, so) => sum + so.subtotal, 0);
      const orderNumber = await generateUniqueOrderNumber(tx);

      const created = await tx.order.create({
        data: {
          orderNumber,
          buyerId: input.buyerId,
          totalAmount,
          shippingAddressSnapshot: input.shippingAddressSnapshot,
          sellerOrders: { create: sellerOrdersData },
          payment: { create: { amount: totalAmount, status: "pending" } },
        },
      });

      return created.id;
    });

    const order = await getOrderByIdForBuyer(input.buyerId, orderId);
    return { ok: true, order: order! };
  } catch (err) {
    if (err instanceof CheckoutError) {
      return { ok: false, reason: err.reason, productName: err.productName, available: err.available } as CreateOrderFromCartResult;
    }
    throw err;
  }
}

export function updateOrderPaymentSession(orderId: string, stripeSessionId: string) {
  return prisma.payment.update({
    where: { orderId },
    data: { stripePaymentIntentId: stripeSessionId },
  });
}

export function markPaymentFailed(orderId: string) {
  return prisma.$transaction([
    prisma.payment.updateMany({ where: { orderId, status: "pending" }, data: { status: "failed" } }),
    prisma.order.updateMany({
      where: { id: orderId, status: "pending_payment" },
      data: { status: "payment_failed" },
    }),
  ]);
}

export function getOrdersForBuyer(buyerId: string, opts?: { take?: number }) {
  return prisma.order.findMany({
    where: { buyerId },
    orderBy: { createdAt: "desc" },
    take: opts?.take ?? 50,
    include: ORDER_INCLUDE,
  });
}

export function getOrderByIdForBuyer(buyerId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, buyerId },
    include: ORDER_INCLUDE,
  });
}
