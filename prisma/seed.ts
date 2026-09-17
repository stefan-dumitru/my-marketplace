import { config } from "dotenv";

// Must run before importing anything that reads process.env.DATABASE_URL at module-load time
// (src/lib/prisma.ts constructs its client singleton eagerly) — a static top-level import would
// be hoisted and evaluated before this call, so the dynamic imports below are load-bearing, not
// stylistic. Defensive belt-and-suspenders: `npx prisma db seed` already loads .env.local via
// prisma7.config.ts before spawning this script, but this also makes `npx tsx prisma/seed.ts`
// work standalone.
config({ path: ".env.local" });

const BCRYPT_COST = 12;

const STARTER_CATEGORIES = [
  { name: "Electronics", slug: "electronics" },
  { name: "Fashion", slug: "fashion" },
  { name: "Home & Garden", slug: "home-garden" },
  { name: "Books", slug: "books" },
  { name: "Sports & Outdoors", slug: "sports-outdoors" },
  { name: "Beauty & Health", slug: "beauty-health" },
];

// Placeholder platform default — confirm the real commission rate before launch.
const DEFAULT_COMMISSION_RATE = 0.1;

async function seedAdmin(prisma: typeof import("@/lib/prisma").prisma) {
  const bcrypt = (await import("bcryptjs")).default;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn("ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin seed.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  // Never overwrite passwordHash on re-run — re-seeding shouldn't silently reset a password
  // that may have changed some other way since the last seed.
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name: "Admin",
      role: "admin",
      status: "active",
      emailVerifiedAt: new Date(),
    },
    update: {
      role: "admin",
      sessionVersion: { increment: 1 },
    },
  });

  console.log(`Admin user ready: ${email}`);
}

async function seedCategories(prisma: typeof import("@/lib/prisma").prisma) {
  for (const category of STARTER_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: {
        name: category.name,
        slug: category.slug,
        isActive: true,
        defaultCommissionRate: DEFAULT_COMMISSION_RATE,
      },
      update: { name: category.name },
    });
  }

  console.log(`${STARTER_CATEGORIES.length} starter categories ready.`);
}

async function main() {
  const { prisma } = await import("@/lib/prisma");
  await seedAdmin(prisma);
  await seedCategories(prisma);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
