import { execSync } from "node:child_process";

// The generated Prisma client is an ES module, which Playwright's CommonJS loader cannot import,
// so the seed runs as its own `tsx` process (the same way the scripts/ files do).
export default async function globalSetup() {
  execSync("npx tsx e2e/seed.ts", { stdio: "inherit", env: process.env });
}
