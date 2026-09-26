import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globalSetup: ["./vitest/global-setup.ts"],
    setupFiles: ["./vitest/setup.ts"],
    // Data/service files touch the same test database via one shared Prisma client — running
    // test files in parallel would race each other's resetDb() truncates, so file parallelism is
    // disabled in favor of one serialized run. `isolate` is deliberately left at its default
    // (true): a prior attempt at isolate: false caused vi.mock("@vercel/blob")/vi.mock("@/lib/
    // inngest") (both declared in setup.ts) to bind inconsistently across files once ANY file
    // called vi.resetModules() — whichever file's copy of the mocked module a shared-registry
    // consumer (e.g. upload-service.ts) happened to load first "won" for the rest of the run,
    // silently breaking toHaveBeenCalled() assertions in unrelated files. Isolating per file
    // costs a little speed but keeps every file's mocks scoped to itself, which is what
    // vi.mock's hoisting semantics assume in the first place.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // server-only unconditionally throws outside a webpack server bundle; see the stub's own
      // comment for why every data/service file's `import "server-only"` needs this redirect.
      "server-only": path.resolve(import.meta.dirname, "vitest/mocks/server-only.ts"),
    },
  },
});
