import fs from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PASSWORD, PRODUCTS, SEED_FILE, USERS, type SeedInfo } from "./constants";

/**
 * Resets the e2e database to a known catalog and three known users. It TRUNCATES EVERY TABLE, so it
 * refuses to run against anything that isn't a local database.
 */
async function main() {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set E2E_DATABASE_URL (or DATABASE_URL in CI) to a throwaway local database.");
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error("Refusing to seed: the e2e database must be on localhost (it is wiped on every run).");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
    `;
    if (tables.length > 0) {
      const names = tables.map((t) => `"${t.tablename}"`).join(", ");
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
    }

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const verified = new Date();
    const buyer = await prisma.user.create({
      data: { ...USERS.buyer, passwordHash, role: "buyer", emailVerifiedAt: verified },
    });
    const sellerUser = await prisma.user.create({
      data: { ...USERS.seller, passwordHash, role: "seller", emailVerifiedAt: verified },
    });
    await prisma.user.create({ data: { ...USERS.admin, passwordHash, role: "admin", emailVerifiedAt: verified } });

    const seller = await prisma.sellerProfile.create({
      data: {
        userId: sellerUser.id,
        storeName: "E2E Gadgets",
        storeSlug: "e2e-gadgets",
        businessRegistrationNumber: "RO0000001",
        status: "approved",
        appliedAt: verified,
        approvedAt: verified,
      },
    });
    const category = await prisma.category.create({
      data: { name: "E2E Electronics", slug: "e2e-electronics", defaultCommissionRate: 0.1, isActive: true },
    });

    const mouse = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category.id,
        sku: PRODUCTS.mouse.sku,
        name: PRODUCTS.mouse.name,
        slug: PRODUCTS.mouse.slug,
        brand: "Clickr",
        description: "A reliable wireless mouse for everyday use.",
        status: "active",
        activatedAt: verified,
        specifications: [...PRODUCTS.mouse.specs],
        variants: { create: [{ sku: PRODUCTS.mouse.sku, price: PRODUCTS.mouse.price, stockQty: PRODUCTS.mouse.stock }] },
      },
    });
    const lamp = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category.id,
        sku: PRODUCTS.lamp.sku,
        name: PRODUCTS.lamp.name,
        slug: PRODUCTS.lamp.slug,
        description: "A warm desk lamp.",
        status: "active",
        activatedAt: verified,
        variants: { create: [{ sku: PRODUCTS.lamp.sku, price: PRODUCTS.lamp.price, stockQty: PRODUCTS.lamp.stock }] },
      },
    });

    const keyboard = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category.id,
        sku: PRODUCTS.keyboard.sku,
        name: PRODUCTS.keyboard.name,
        slug: PRODUCTS.keyboard.slug,
        description: "A mechanical keyboard.",
        status: "active",
        activatedAt: verified,
        specifications: [...PRODUCTS.keyboard.specs],
        variants: {
          create: [{ sku: PRODUCTS.keyboard.sku, price: PRODUCTS.keyboard.price, stockQty: PRODUCTS.keyboard.stock }],
        },
      },
    });

    // A paid order waiting for the seller to ship it: confirmed, with no label (and so no tracking number) yet.
    const order = await prisma.order.create({
      data: {
        orderNumber: "ORD-E2E-0001",
        buyerId: buyer.id,
        status: "paid",
        totalAmount: 40,
        shippingAmount: 15,
        shippingAddressSnapshot: {
          recipientName: "Maria Popescu",
          line1: "Strada Exemplu 10",
          line2: "",
          city: "Cluj-Napoca",
          county: "Cluj",
          postalCode: "400001",
          country: "Romania",
          phone: "0723456789",
        },
        payment: { create: { amount: 40, status: "succeeded", paidAt: verified } },
        sellerOrders: {
          create: [
            {
              sellerId: seller.id,
              status: "confirmed",
              subtotal: 25,
              commissionAmount: 2.5,
              payoutAmount: 37.5,
              items: {
                create: [
                  {
                    productVariantId: (await prisma.productVariant.findFirstOrThrow({ where: { productId: mouse.id } })).id,
                    productNameSnapshot: PRODUCTS.mouse.name,
                    unitPriceSnapshot: 25,
                    quantity: 1,
                    lineTotal: 25,
                  },
                ],
              },
            },
          ],
        },
      },
      include: { sellerOrders: true },
    });

    const info: SeedInfo = {
      mouseId: mouse.id,
      lampId: lamp.id,
      keyboardId: keyboard.id,
      confirmedSellerOrderId: order.sellerOrders[0].id,
    };
    fs.writeFileSync(SEED_FILE, JSON.stringify(info));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
