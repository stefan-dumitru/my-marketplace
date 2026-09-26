import { prisma } from "@/lib/prisma";

// Fixture factories shared across test files, mirroring tests/helpers.py's role in the copied
// reference suite. None of these tests exercise real login/authorize(), so passwordHash is a
// static placeholder rather than a real bcrypt hash — bcrypt at a real cost factor across dozens
// of fixtures would make the suite noticeably slower for no test here that would ever check it.
const PLACEHOLDER_PASSWORD_HASH = "test-fixture-hash-never-checked";

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function createBuyer(overrides?: { emailVerified?: boolean; name?: string }) {
  return prisma.user.create({
    data: {
      email: `${unique("buyer")}@example.com`,
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
      name: overrides?.name ?? "Test Buyer",
      role: "buyer",
      emailVerifiedAt: overrides?.emailVerified === false ? null : new Date(),
    },
  });
}

export async function createAdmin() {
  return prisma.user.create({
    data: {
      email: `${unique("admin")}@example.com`,
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
      name: "Test Admin",
      role: "admin",
      emailVerifiedAt: new Date(),
    },
  });
}

export async function createApprovedSeller(overrides?: { storeName?: string; payoutsEnabled?: boolean }) {
  const user = await prisma.user.create({
    data: {
      email: `${unique("seller")}@example.com`,
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
      name: "Test Seller",
      role: "seller",
      emailVerifiedAt: new Date(),
    },
  });
  const profile = await prisma.sellerProfile.create({
    data: {
      userId: user.id,
      storeName: overrides?.storeName ?? unique("Store"),
      storeSlug: unique("store"),
      businessRegistrationNumber: unique("RO"),
      status: "approved",
      appliedAt: new Date(),
      approvedAt: new Date(),
      payoutsEnabled: overrides?.payoutsEnabled ?? false,
    },
  });
  return { user, profile };
}

export async function createCategory(overrides?: { name?: string; parentId?: string | null }) {
  return prisma.category.create({
    data: {
      name: overrides?.name ?? unique("Category"),
      slug: unique("category"),
      parentId: overrides?.parentId ?? null,
      defaultCommissionRate: 0.1,
      isActive: true,
    },
  });
}

export async function createActiveProduct(
  sellerId: string,
  categoryId: string,
  overrides?: { name?: string; price?: number; stockQty?: number; status?: "active" | "pending_review" | "inactive" | "rejected" | "draft" }
) {
  const name = overrides?.name ?? unique("Product");
  return prisma.product.create({
    data: {
      sellerId,
      categoryId,
      sku: unique("sku"),
      name,
      slug: unique("product"),
      status: overrides?.status ?? "active",
      images: [],
      variants: {
        create: [{ sku: unique("var-sku"), price: overrides?.price ?? 10, stockQty: overrides?.stockQty ?? 5 }],
      },
    },
    include: { variants: true },
  });
}

const DEFAULT_ADDRESS_SNAPSHOT = {
  recipientName: "Test Buyer",
  line1: "Str. Exemplu 1",
  line2: "",
  city: "București",
  county: "București",
  postalCode: "010101",
  country: "România",
  phone: "0700000000",
};

/** Places a real order via the actual checkout data function — never mocked. */
export async function placeOrder(
  buyerId: string,
  items: { productVariantId: string; quantity: number }[]
) {
  const { createOrderFromCart } = await import("@/server/data/orders");
  const result = await createOrderFromCart({
    buyerId,
    items,
    shippingAddressSnapshot: DEFAULT_ADDRESS_SNAPSHOT,
  });
  if (!result.ok) throw new Error(`placeOrder helper failed: ${JSON.stringify(result)}`);
  return result.order;
}

export async function deliverSellerOrder(sellerOrderId: string) {
  return prisma.sellerOrder.update({
    where: { id: sellerOrderId },
    data: { status: "delivered", deliveredAt: new Date() },
  });
}
