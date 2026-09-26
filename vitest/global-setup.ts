import { config } from "dotenv";
import { execSync } from "node:child_process";
import { Client } from "pg";

// Runs once before the whole Vitest run (not per test file) — creates the test database if it
// doesn't exist yet and brings it fully up to date with the real migrations, so there's no manual
// setup step to remember and the schema never drifts from what's actually deployed.
export default async function globalSetup() {
  config({ path: ".env.local" });

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error("TEST_DATABASE_URL is not set — see .env.local.example.");
  }

  const dbName = new URL(testUrl).pathname.replace(/^\//, "");

  // CREATE DATABASE has no IF NOT EXISTS in Postgres, so check first via the maintenance db.
  const adminUrl = testUrl.replace(`/${dbName}`, "/postgres");
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (rowCount === 0) {
      // Database names can't be parameterized — dbName comes from our own .env.local, not
      // user input, so this is safe.
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
