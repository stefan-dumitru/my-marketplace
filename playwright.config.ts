import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const STRIPE_PORT = 12111;
const BASE_URL = `http://localhost:${PORT}`;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

// Everything the app might otherwise pick up from a developer's .env.local (Next loads it for
// `next start` too). Explicit empty values win over the file, so a local run can never reach
// real email, search, storage, CAPTCHA or Google services.
const ISOLATED_ENV = {
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  MEILISEARCH_HOST: "",
  MEILISEARCH_API_KEY: "",
  BLOB_READ_WRITE_TOKEN: "",
  INNGEST_EVENT_KEY: "",
  INNGEST_SIGNING_KEY: "",
  TURNSTILE_SECRET_KEY: "",
  TURNSTILE_SITE_KEY: "",
  AUTH_GOOGLE_ID: "",
  AUTH_GOOGLE_SECRET: "",
  STRIPE_SUBSCRIPTION_PRICE_ID: "",
  SMTP_USER: "",
  SMTP_PASS: "",
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  // One shared database and one seeded catalog: tests run in order, not in parallel.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/fake-stripe.mjs",
      port: STRIPE_PORT,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Runs the production build (`npm run build` first), the same artifact CI and Railway use.
      command: `npx next start -p ${PORT}`,
      url: `${BASE_URL}/api/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...ISOLATED_ENV,
        DATABASE_URL,
        NEXTAUTH_URL: BASE_URL,
        AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else",
        STRIPE_SECRET_KEY: "sk_test_e2e_fake",
        STRIPE_WEBHOOK_SECRET: "whsec_e2e_fake",
        STRIPE_API_BASE_URL: `http://localhost:${STRIPE_PORT}`,
        CARRIER_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
        INNGEST_DEV: "1",
      },
    },
  ],
});
