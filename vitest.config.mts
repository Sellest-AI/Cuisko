import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // `@convex/*` and `@shared/*` are declared in convex/tsconfig.json, which tsc and the Convex
  // bundler both read — Vite does not. Without these, any function reached through an alias fails
  // to load at test time only, long after typecheck went green. Keep this in sync with the
  // `paths` block in convex/tsconfig.json.
  resolve: {
    alias: {
      "@convex": fileURLToPath(new URL("./convex", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },

  test: {
    // convex-test runs Convex functions in-process; the Convex runtime is a web runtime.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.expo/**"],

    // convex/env.ts throws on a missing key by design (P4), so the test run has to supply a
    // valid environment — the same contract a real deployment has to satisfy.
    env: {
      CONVEX_SITE_URL: "https://cuisko-test.convex.site",
      SERVER_PRIVATE_KEY: "test-server-private-key-0123456789abcdef",
    },
  },
});
