import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Creates a Product and its single default ProductVariant in one nested-write Prisma call —
 * atomic without needing an explicit transaction. `sellerId` is a required first parameter,
 * per CLAUDE.md's ownership-scoping rule (there is no code path that creates a product without
 * an owning seller baked into the call).
 */
export function createProductForSeller(
  sellerId: string,
  input: {
    categoryId: string;
    sku: string;
    name: string;
    slug: string;
    description?: string;
    brand?: string;
    images: string[];
    price: number;
    stockQty: number;
  }
) {
  return prisma.product.create({
    data: {
      sellerId,
      categoryId: input.categoryId,
      sku: input.sku,
      name: input.name,
      slug: input.slug,
      description: input.description || null,
      brand: input.brand || null,
      images: input.images,
      status: "active",
      activatedAt: new Date(),
      variants: {
        create: [{ sku: input.sku, price: input.price, stockQty: input.stockQty }],
      },
    },
    include: { variants: true },
  });
}

export function getProductBySellerAndSku(sellerId: string, sku: string) {
  return prisma.product.findUnique({ where: { sellerId_sku: { sellerId, sku } } });
}

/**
 * Returns the product regardless of status — deciding which statuses are publicly visible is a
 * business rule and belongs in the service layer (product-service.ts), not baked into this read.
 */
export function getProductBySlug(slug: string) {
  return prisma.product.findUnique({
    where: { slug },
    include: {
      variants: true,
      category: { select: { name: true, slug: true } },
      seller: { select: { storeName: true, storeSlug: true } },
    },
  });
}

export function listProductsForSeller(sellerId: string, opts?: { take?: number }) {
  return prisma.product.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    take: opts?.take ?? 50,
    include: { variants: true, category: { select: { name: true } } },
  });
}

export function listActiveProducts(opts?: { take?: number }) {
  return prisma.product.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    take: opts?.take ?? 24,
    include: {
      variants: true,
      seller: { select: { storeName: true, storeSlug: true } },
      category: { select: { name: true, slug: true } },
    },
  });
}
