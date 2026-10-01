// Full Meilisearch rebuild from Postgres — the initial backfill, and a manual "fix drift" button.
// Run with: npm run search:reindex   (the same job also runs nightly via Inngest).
import { config } from "dotenv";
config({ path: ".env.local" });

// `server-only` throws outside Next's bundler; this script is server code by definition.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

async function main() {
  const { isSearchConfigured } = await import("../src/lib/search");
  if (!isSearchConfigured()) {
    console.error("MEILISEARCH_HOST is not set — nothing to index.");
    process.exit(1);
  }
  const { reindexAllProducts } = await import("../src/server/services/search-service");
  const started = Date.now();
  const { upserted } = await reindexAllProducts();
  console.log(`Indexed ${upserted} products in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
