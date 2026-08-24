import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const at = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * The `paths` block of tsconfig.json, restated for Vite.
 *
 * `tsc`, Metro and Convex's bundler each read a tsconfig; Vite reads none of them. An alias that
 * exists in tsconfig.json but not here resolves at typecheck and fails at test time only — green
 * `pnpm typecheck`, red `pnpm test`, and the error names a bare specifier rather than a path.
 *
 * Order matters: Vite takes the first `find` that matches, so `@ui/hooks/` and `@ui/utils` are
 * listed before the `@ui/` that would otherwise swallow them.
 *
 * `react-native` is anchored (`/^react-native$/`) rather than left as a bare string, because a
 * string alias matches by PREFIX — `react-native-svg`, `react-native-gesture-handler` and
 * `react-native-web` itself would all be rewritten, and the last one recurses.
 */
const aliases = [
  { find: /^react-native$/, replacement: "react-native-web" },
  { find: /^theme$/, replacement: at("./src/global/theme.ts") },
  { find: /^env$/, replacement: at("./env.ts") },
  { find: /^translations$/, replacement: at("./translations/index.ts") },
  { find: /^translations\//, replacement: at("./translations/") },
  { find: /^@ui\/hooks\//, replacement: at("./src/ui/hooks/") },
  { find: /^@ui\/utils$/, replacement: at("./src/ui/utils") },
  { find: /^@ui\//, replacement: at("./src/ui/components/") },
  { find: /^@shared\//, replacement: at("./shared/") },
  { find: /^@convex\//, replacement: at("./convex/") },
  { find: /^~\//, replacement: at("./src/") },
  { find: /^assets\//, replacement: at("./assets/") },
];

export default defineConfig({
  /**
   * Two runtimes, because the code under test has two.
   *
   * Convex functions run in a web runtime with no DOM; components run against a DOM. A single
   * project has to pick one, and picking `edge-runtime` is what kept every `.tsx` in this repo
   * untestable — the config could not have rendered one even if a test had been written.
   */
  test: {
    projects: [
      {
        resolve: { alias: { "@convex": at("./convex"), "@shared": at("./shared") } },
        test: {
          name: "convex",
          environment: "edge-runtime",
          server: { deps: { inline: ["convex-test"] } },
          include: ["convex/**/*.test.ts", "shared/**/*.test.ts"],

          // convex/env.ts throws on a missing key by design (P4), so the test run has to supply a
          // valid environment — the same contract a real deployment has to satisfy.
          env: {
            CONVEX_SITE_URL: "https://cuisko-test.convex.site",
            SERVER_PRIVATE_KEY: "test-server-private-key-0123456789abcdef",
          },
        },
      },
      {
        resolve: {
          alias: aliases,
          // `.web.*` first, so a component with a web variant is tested as the web build resolves
          // it rather than through the native file react-native-web cannot run.
          extensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".web.js", ".js", ".json"],
        },
        // React Native ships `__DEV__` as a global its own source reads. Without this, importing
        // almost anything from react-native-web is a ReferenceError.
        define: { __DEV__: "true" },
        test: {
          name: "app",
          environment: "jsdom",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx", "app/**/*.test.ts", "app/**/*.test.tsx"],
          setupFiles: ["./test/setup.dom.ts"],
        },
      },
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.expo/**", "**/.history/**"],
  },
});
