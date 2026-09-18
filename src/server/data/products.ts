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
      status: "pending_review",
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

export function getProductByIdForSeller(sellerId: string, productId: string) {
  return prisma.product.findFirst({
    where: { id: productId, sellerId },
    include: { variants: true, category: { select: { name: true } } },
  });
}

/**
 * Verify-then-update: confirms the product belongs to this seller via a scoped read before
 * updating by primary key. (Not relying on Prisma's "extra filters in update()'s where" — not
 * confirmed against this project's Prisma version — this pattern is unambiguous either way.)
 *
 * The nested `variants.updateMany` is safe here specifically because this codebase creates
 * exactly one variant per product (see createProductForSeller) — it is NOT a generalizable
 * multi-variant update.
 */
export async function updateProductForSeller(
  sellerId: string,
  productId: string,
  data: {
    categoryId: string;
    name: string;
    description?: string;
    brand?: string;
    images: string[];
    price: number;
    stockQty: number;
  }
) {
  const owned = await prisma.product.findFirst({
    where: { id: productId, sellerId },
    select: { id: true },
  });
  if (!owned) return null;

  return prisma.product.update({
    where: { id: productId },
    data: {
      categoryId: data.categoryId,
      name: data.name,
      description: data.description || null,
      brand: data.brand || null,
      images: data.images,
      variants: {
        updateMany: { where: {}, data: { price: data.price, stockQty: data.stockQty } },
      },
    },
    include: { variants: true },
  });
}

export async function setProductStatusForSeller(
  sellerId: string,
  productId: string,
  status: "active" | "inactive"
) {
  const owned = await prisma.product.findFirst({
    where: { id: productId, sellerId },
    select: { id: true },
  });
  if (!owned) return null;

  return prisma.product.update({
    where: { id: productId },
    data:
      status === "active"
        ? { status: "active", activatedAt: new Date() }
        : { status: "inactive", deactivatedAt: new Date() },
  });
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

export function listPendingProductsForAdmin(opts?: { take?: number }) {
  return prisma.product.findMany({
    where: { status: "pending_review" },
    orderBy: { createdAt: "asc" },
    take: opts?.take ?? 50,
    include: {
      seller: { select: { storeName: true } },
      category: { select: { name: true } },
      variants: true,
    },
  });
}

/**
 * Verify-then-update: only a currently-pending_review product can be decided, so a double-click
 * (or two admins acting on the same queue) can't flip an already-decided product a second time.
 */
async function setPendingProductStatus(productId: string, status: "active" | "rejected") {
  const owned = await prisma.product.findFirst({
    where: { id: productId, status: "pending_review" },
    select: { id: true },
  });
  if (!owned) return null;

  return prisma.product.update({
    where: { id: productId },
    data: status === "active" ? { status: "active", activatedAt: new Date() } : { status: "rejected" },
  });
}

export function approveProductForAdmin(productId: string) {
  return setPendingProductStatus(productId, "active");
}

export function rejectProductForAdmin(productId: string) {
  return setPendingProductStatus(productId, "rejected");
}

export function listActiveProducts(opts?: { take?: number; q?: string; categorySlug?: string }) {
  return prisma.product.findMany({
    where: {
      status: "active",
      // Plain contains/insensitive search — a deliberate v1 simplification, not the tsvector
      // full-text search functional.md eventually calls for. The ?q=&category= URL shape won't
      // need to change if that's added later; only this where-clause construction will.
      ...(opts?.q ? { name: { contains: opts.q, mode: "insensitive" as const } } : {}),
      ...(opts?.categorySlug ? { category: { slug: opts.categorySlug } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts?.take ?? 24,
    include: {
      variants: true,
      seller: { select: { storeName: true, storeSlug: true } },
      category: { select: { name: true, slug: true } },
    },
  });
}
