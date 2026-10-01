import { config } from "dotenv";
import { beforeEach, vi } from "vitest";

config({ path: ".env.local" });

// next-auth transitively imports "next/server", which only resolves inside Next's own bundler,
// not under plain Vite/Node — this breaks loading any file that imports @/lib/auth (seller-
// service.ts, and everything that imports *that*: category/order/seller-order-service.ts) even
// though none of these tests exercise real login/session flows. Stubbed globally rather than
// per-file since the same failure would otherwise recur in every test file that touches one of
// those services.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

// No Inngest dev server is guaranteed to be running during a test run, and even when one is,
// tests shouldn't depend on a real event bus for something this deterministic — background-job
// tests assert against the service functions the Inngest functions call (see
// sales-rollup-service.test.ts, notification-service.test.ts), not against Inngest itself.
// createOrderFromCart's best-effort low-stock dispatch is the one call site that fires
// synchronously inside a service test, so this mock exists mainly to keep that assertable and
// fast rather than a real (or failing) network call.
vi.mock("@/lib/inngest", () => ({
  inngest: { send: vi.fn(async () => ({ ids: [] as string[] })) },
}));

// Global for the same reason as @/lib/auth above: with isolate: false, every test file shares one
// module registry, so whichever file imports upload-service.ts (or something that transitively
// does, e.g. product-service.ts) FIRST determines what @vercel/blob resolves to for the entire
// run. A per-file vi.mock in upload-service.test.ts only works if that file happens to import
// upload-service.ts before anyone else does — real work is never allowed to touch actual Blob
// storage during a test run, so this is registered here instead, unconditionally.
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (path: string) => ({ url: `https://example.public.blob.vercel-storage.com/${path}` })),
  del: vi.fn(async () => {}),
}));

// @/lib/stripe constructs a real Stripe client at MODULE IMPORT time (throws immediately if
// STRIPE_SECRET_KEY is unset — see that file), so any test file that transitively imports it
// (seller-order-service.ts's refund calls in cancelSellerOrder/approveReturnRequest) would
// otherwise either crash outright (no key configured, e.g. in CI) or — worse — silently place a
// real call against Stripe's live API whenever a real key IS configured locally. Mocked
// unconditionally, same reasoning as @vercel/blob above.
vi.mock("@/lib/stripe", () => ({
  stripe: {
    refunds: { create: vi.fn(async () => ({ id: "re_test_mock" })) },
    // Checkout: tests assert on the exact amounts handed to Stripe, never on a real session.
    coupons: { create: vi.fn(async () => ({ id: "co_test_mock" })) },
    checkout: { sessions: { create: vi.fn(async () => ({ id: "cs_test_mock", url: "https://stripe.test/pay" })) } },
  },
}));

// Meilisearch is optional infrastructure: .env.local on a dev machine may point at a real local
// instance, but a test run must never talk to it (or to anything real). isSearchConfigured is
// forced off by default — beforeEach below re-asserts that, since with isolate: false a test that
// flips it on would otherwise leak into every later file. Search tests opt in explicitly and supply
// their own fake index via getProductsIndex.
vi.mock("@/lib/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search")>();
  return {
    ...actual,
    isSearchConfigured: vi.fn(() => false),
    getProductsIndex: vi.fn(),
    ensureProductsIndex: vi.fn(async () => {}),
  };
});

// Must happen before any test file imports "@/lib/prisma" — that module reads
// process.env.DATABASE_URL at call time (when its Prisma client is constructed), not at import
// time, and Vitest runs setupFiles ahead of each test file's own module graph, so this reliably
// redirects every test off the dev database and onto the isolated test one.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set — see .env.local.example.");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Full-table truncate before every test, not a per-test transaction: this codebase's data/service
 * functions all go through one shared `prisma` singleton (not an injectable transaction client),
 * so the reference suite's SAVEPOINT-per-test trick isn't available without a much bigger refactor
 * than a test suite warrants. Table list is queried dynamically so it never needs hand-maintenance
 * as models are added.
 */
async function resetDb() {
  const { prisma } = await import("@/lib/prisma");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

beforeEach(async () => {
  vi.clearAllMocks();
  const search = await import("@/lib/search");
  vi.mocked(search.isSearchConfigured).mockReturnValue(false);
  await resetDb();
});
