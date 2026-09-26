// One-off script to add an Electronics seller with products and reviews, matching the style of
// the existing realistic seed data (prisma/seed.ts only seeds admin + categories — the demo
// sellers/products/orders/reviews were added separately). Not wired into `npx prisma db seed`;
// run directly with `npx tsx prisma/scripts/seed-electronics.ts`. Safe to re-run: every create is
// gated by an upsert or an existence check.
import { config } from "dotenv";
config({ path: ".env.local" });

// Same bcrypt hash every other seed user shares (see users.passwordHash in the DB) — reusing it
// keeps the demo login password consistent across all seed accounts.
const SHARED_SEED_PASSWORD_HASH = "$2b$12$g.WO4RN3CAaQ.QsDgwgAi./GY99GNyXs8yMVny8tQrbTfqonguXPO";

const REVIEW_TEMPLATES = [
  { rating: 5, title: "Exceeded expectations", body: "Genuinely impressed with the quality — arrived quickly and works exactly as described. Would buy again." },
  { rating: 5, title: "Would recommend", body: "Better than I expected honestly. Already recommended it to a friend." },
  { rating: 5, title: "Great value", body: "For the price, this is excellent. Well made and does exactly what I needed." },
  { rating: 4, title: "Very happy with this", body: "Solid product overall. A couple of minor quirks but nothing that would stop me recommending it." },
  { rating: 4, title: "Good purchase", body: "Does the job well. Packaging was good and delivery was on time." },
  { rating: 4, title: "Happy customer", body: "No complaints — works well and looks good too." },
  { rating: 3, title: "It's fine", body: "Does what it says, nothing more, nothing less. Average experience overall." },
  { rating: 2, title: "A bit disappointing", body: "Not quite what I expected from the photos. Still usable but wouldn't buy again." },
];

const SHIPPING_SNAPSHOT = {
  recipientName: "Seeded Buyer",
  line1: "Str. Exemplu 1",
  line2: "",
  city: "București",
  county: "București",
  postalCode: "010101",
  country: "România",
  phone: "0700000000",
};

const PRODUCTS = [
  {
    sku: "ELEC-EARBUDS-01",
    name: "Wireless Earbuds Pro",
    brand: "Sonara",
    description: "True wireless earbuds with active noise cancellation and 30-hour total battery life.",
    image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&q=80",
    price: 249.99,
    stockQty: 60,
    reviewCount: 5,
  },
  {
    sku: "ELEC-WATCH-01",
    name: "Fitness Smartwatch",
    brand: "Pulsewear",
    description: "Smartwatch with heart-rate, SpO2 and sleep tracking, plus a 10-day battery life.",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80",
    price: 399.99,
    stockQty: 35,
    reviewCount: 4,
  },
  {
    sku: "ELEC-SPEAKER-01",
    name: "Portable Bluetooth Speaker",
    brand: "Sonara",
    description: "Compact waterproof speaker with 360° sound and 12-hour playtime.",
    image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
    price: 179.99,
    stockQty: 45,
    reviewCount: 3,
  },
  {
    sku: "ELEC-KEYBOARD-01",
    name: "Mechanical Keyboard",
    brand: "Keytronix",
    description: "Hot-swappable mechanical keyboard with hot backlit keys and a USB-C connection.",
    image: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=800&q=80",
    price: 349.99,
    stockQty: 25,
    reviewCount: 4,
  },
  {
    sku: "ELEC-POWERBANK-01",
    name: "20000mAh Power Bank",
    brand: "Voltra",
    description: "High-capacity power bank with 65W fast charging for laptops and phones alike.",
    image: "https://images.unsplash.com/photo-1585338447937-7082f8fc763d?w=800&q=80",
    price: 129.99,
    stockQty: 70,
    reviewCount: 5,
  },
];

function randomPastDate(maxDaysAgo: number): Date {
  const daysAgo = Math.floor(Math.random() * maxDaysAgo) + 1;
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

function orderNumber(id: string, n: number): string {
  return `ORD-SEED-${id.slice(0, 8).toUpperCase()}-${n}`;
}

async function main() {
  const { prisma } = await import("@/lib/prisma");

  const category = await prisma.category.findUniqueOrThrow({ where: { slug: "electronics" } });

  const buyers = await prisma.user.findMany({
    where: { role: "buyer", email: { endsWith: "@example.com" } },
    select: { id: true, name: true },
  });
  if (buyers.length === 0) throw new Error("No seed buyers found — run the main seed data first.");

  const sellerUser = await prisma.user.upsert({
    where: { email: "adrian-petrescu@example.com" },
    create: {
      email: "adrian-petrescu@example.com",
      passwordHash: SHARED_SEED_PASSWORD_HASH,
      name: "Adrian Petrescu",
      role: "seller",
      status: "active",
      emailVerifiedAt: new Date(),
    },
    update: {},
  });

  const sellerProfile = await prisma.sellerProfile.upsert({
    where: { userId: sellerUser.id },
    create: {
      userId: sellerUser.id,
      storeName: "CircuitHub Electronics",
      storeSlug: "circuithub-electronics",
      description: "Everyday tech and gadgets — audio, wearables and accessories.",
      businessRegistrationNumber: "RO39481022",
      status: "approved",
      approvedAt: new Date(),
    },
    update: {},
  });

  let orderCounter = await prisma.order.count();
  let reviewsCreated = 0;
  let productsCreated = 0;

  for (const p of PRODUCTS) {
    const existing = await prisma.product.findUnique({
      where: { sellerId_sku: { sellerId: sellerProfile.id, sku: p.sku } },
    });
    if (existing) {
      console.log(`Skipping "${p.name}" — already exists.`);
      continue;
    }

    const slug = p.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const product = await prisma.product.create({
      data: {
        sellerId: sellerProfile.id,
        categoryId: category.id,
        sku: p.sku,
        name: p.name,
        slug,
        description: p.description,
        brand: p.brand,
        images: [p.image],
        status: "active",
        activatedAt: new Date(),
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `${p.sku}-DEFAULT`,
        price: p.price,
        stockQty: p.stockQty,
      },
    });
    productsCreated += 1;

    const reviewers = [...buyers].sort(() => Math.random() - 0.5).slice(0, p.reviewCount);
    const commissionRate = Number(category.defaultCommissionRate);

    for (const buyer of reviewers) {
      orderCounter += 1;
      const deliveredAt = randomPastDate(180);
      const lineTotal = p.price;
      const commissionAmount = Number((lineTotal * commissionRate).toFixed(2));
      const payoutAmount = Number((lineTotal - commissionAmount).toFixed(2));

      const order = await prisma.order.create({
        data: {
          orderNumber: orderNumber(product.id, orderCounter),
          buyerId: buyer.id,
          status: "paid",
          totalAmount: lineTotal,
          shippingAddressSnapshot: SHIPPING_SNAPSHOT,
          createdAt: deliveredAt,
        },
      });

      await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: lineTotal,
          status: "succeeded",
        },
      });

      const sellerOrder = await prisma.sellerOrder.create({
        data: {
          orderId: order.id,
          sellerId: sellerProfile.id,
          status: "delivered",
          subtotal: lineTotal,
          commissionAmount,
          payoutAmount,
          deliveredAt,
        },
      });

      const orderItem = await prisma.orderItem.create({
        data: {
          sellerOrderId: sellerOrder.id,
          productVariantId: variant.id,
          productNameSnapshot: product.name,
          unitPriceSnapshot: p.price,
          quantity: 1,
          lineTotal,
        },
      });

      const template = REVIEW_TEMPLATES[Math.floor(Math.random() * REVIEW_TEMPLATES.length)];
      await prisma.review.create({
        data: {
          productId: product.id,
          buyerId: buyer.id,
          orderItemId: orderItem.id,
          rating: template.rating,
          title: template.title,
          body: template.body,
          status: "approved",
          createdAt: deliveredAt,
        },
      });
      reviewsCreated += 1;
    }

    console.log(`Created "${p.name}" with ${reviewers.length} reviews.`);
  }

  console.log(`Done: ${productsCreated} products created, ${reviewsCreated} reviews created.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
