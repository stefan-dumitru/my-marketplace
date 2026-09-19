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
 * Targets the product's first/default variant specifically (by id, fetched during the same
 * ownership read) rather than `variants.updateMany({ where: {} })` — now that a product can have
 * more than one variant (see product-variant-service.ts), blindly updating every variant with
 * this form's single price/stock field would silently corrupt the others. ProductForm's
 * price/stockQty fields mean "the default variant," not "every variant."
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
    select: { id: true, variants: { select: { id: true }, orderBy: { id: "asc" }, take: 1 } },
  });
  if (!owned) return null;
  const defaultVariantId = owned.variants[0]?.id;

  return prisma.product.update({
    where: { id: productId },
    data: {
      categoryId: data.categoryId,
      name: data.name,
      description: data.description || null,
      brand: data.brand || null,
      images: data.images,
      ...(defaultVariantId && {
        variants: {
          update: {
            where: { id: defaultVariantId },
            data: { price: data.price, stockQty: data.stockQty },
          },
        },
      }),
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

// --- Variant CRUD ---
// Ownership scoping only — the "last variant" / "has order history" business rules live in
// product-variant-service.ts, same split already used elsewhere (e.g. category-service.ts's
// "can't be its own parent" check sits above updateCategory's plain verify-then-update).

export async function getVariantsForProduct(sellerId: string, productId: string) {
  const owned = await prisma.product.findFirst({ where: { id: productId, sellerId }, select: { id: true } });
  if (!owned) return null;

  return prisma.productVariant.findMany({ where: { productId }, orderBy: { id: "asc" } });
}

export async function getVariantForProduct(sellerId: string, productId: string, variantId: string) {
  const owned = await prisma.product.findFirst({ where: { id: productId, sellerId }, select: { id: true } });
  if (!owned) return null;

  return prisma.productVariant.findFirst({ where: { id: variantId, productId } });
}

export function getVariantBySellerAndSku(sellerId: string, sku: string) {
  return prisma.productVariant.findFirst({ where: { sku, product: { sellerId } } });
}

export async function createVariantForProduct(
  sellerId: string,
  productId: string,
  data: { sku: string; attributes: Record<string, string>; price: number; stockQty: number }
) {
  const owned = await prisma.product.findFirst({ where: { id: productId, sellerId }, select: { id: true } });
  if (!owned) return null;

  return prisma.productVariant.create({ data: { ...data, productId } });
}

export async function updateVariantForProduct(
  sellerId: string,
  productId: string,
  variantId: string,
  data: { attributes: Record<string, string>; price: number; stockQty: number }
) {
  const owned = await prisma.productVariant.findFirst({
    where: { id: variantId, productId, product: { sellerId } },
    select: { id: true },
  });
  if (!owned) return null;

  return prisma.productVariant.update({ where: { id: variantId }, data });
}

export async function deleteVariantForProduct(sellerId: string, productId: string, variantId: string) {
  const owned = await prisma.productVariant.findFirst({
    where: { id: variantId, productId, product: { sellerId } },
    select: { id: true },
  });
  if (!owned) return null;

  // Cart contents aren't a committed record like OrderItem, so removing a variant that's
  // sitting unpurchased in someone's cart should just clear it from those carts rather than
  // being blocked by the FK constraint.
  const [, deleted] = await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { productVariantId: variantId } }),
    prisma.productVariant.delete({ where: { id: variantId } }),
  ]);
  return deleted;
}

export function countVariantsForProduct(productId: string) {
  return prisma.productVariant.count({ where: { productId } });
}

export function countOrderItemsForVariant(variantId: string) {
  return prisma.orderItem.count({ where: { productVariantId: variantId } });
}
