import "server-only";
import Stripe from "stripe";

declare global {
  // eslint-disable-next-line no-var
  var __stripe: Stripe | undefined;
}

function createStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  // Test-only hook: the browser (Playwright) tests point the SDK at a local fake Stripe server
  // so checkout can be exercised end to end. Never set outside e2e/.
  const apiBase = process.env.STRIPE_API_BASE_URL;
  if (apiBase) {
    const url = new URL(apiBase);
    return new Stripe(secretKey, {
      host: url.hostname,
      port: url.port || undefined,
      protocol: url.protocol === "http:" ? "http" : "https",
    });
  }
  // No apiVersion pin — the installed SDK version already targets a specific Stripe API version
  // by default, which is Stripe's own recommended default rather than guessing a literal string.
  return new Stripe(secretKey);
}

// Reused across hot-reloads in dev, same rationale as the Prisma singleton in src/lib/prisma.ts.
export const stripe = globalThis.__stripe ?? createStripeClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__stripe = stripe;
}
