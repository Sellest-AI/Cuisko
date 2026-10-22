import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const at = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * What every project that runs automatically must refuse to collect.
 *
 * The top-level `exclude` does NOT reach into a project — a project either declares its own or
 * collects whatever its `include` matches. So this is restated by each of the three automatic
 * projects rather than set once above them, and `manual` is the one that leaves it out, since
 * excluding `*.manual.test.ts` there would exclude that project from itself.
 *
 * A hand-run test claimed by an automatic project is a hand-run test billed on every commit.
 */
const AUTOMATIC_EXCLUDE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.expo/**",
  "**/.history/**",
  // The worktrees other sessions open inside the repo: a full copy of the tree, tests included.
  "**/.claude/worktrees/**",
  "**/*.manual.test.ts",
] as const;

/**
 * `.env.local`, as a plain object.
 *
 * Hand-rolled rather than Vite's `loadEnv`, which is not re-exported by `vitest/config` and lives
 * in a `vite` this project does not depend on directly. Only the `manual` project reads it, and only
 * for `OPENROUTER_API_KEY` — the app gets its own env through Expo, and the Convex backend gets
 * its own from the deployment. This is not a general env loader and should not become one.
 */
const dotEnvLocal = (): Record<string, string> => {
  const file = at("./.env.local");
  if (!existsSync(file)) return {};

  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((vars, line) => {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (match) vars[match[1]!] = match[2]!.trim().replace(/^["']|["']$/g, "");

      return vars;
    }, {});
};

/**
 * The environment `convex/env.ts` demands, as placeholders.
 *
 * `env.ts` is Zod-validated and throws at import time on a missing key (P4), and `procedures.ts`
 * imports it — so every Convex test file dies at import if one var is absent, whether or not the
 * test touches the service behind it. That is not a hypothetical: adding the Replicate, RunPod and
 * S3 keys to `env.ts` took out 25 test files and 79 tests at once.
 *
 * Declared once and spread into both projects that need it, rather than written out twice, because
 * the drift is the whole failure mode: two copies means the next key added to `env.ts` is
 * remembered in one of them.
 *
 * Values only have to satisfy the schema's shape (`.min(32)` on the API keys) — nothing here
 * reaches a real service, and a test that wants to must mock it.
 */
const CONVEX_TEST_ENV = {
  CONVEX_SITE_URL: "https://cuisko-test.convex.site",
  SITE_URL: "http://localhost:8081",
  AUTH_GOOGLE_ID: "test-google-client-id",
  AUTH_GOOGLE_SECRET: "test-google-client-secret",
  AUTH_APPLE_ID: "test-apple-services-id",
  AUTH_APPLE_SECRET: "test-apple-client-secret",
  SERVER_PRIVATE_KEY: "test-server-private-key-0123456789abcdef",
  OPENROUTER_API_KEY: "test-openrouter-api-key-0123456789abcdef",
  REPLICATE_API_KEY: "test-replicate-api-key-0123456789abcdef",
  RUNPOD_API_KEY: "test-runpod-api-key-0123456789abcdef",
  FDC_API_KEY: "test-fdc-api-key",
  S3_ENDPOINT: "s3.test-region.example.com",
  S3_APP_KEY_ID: "test-s3-app-key-id",
  S3_APP_KEY: "test-s3-app-key",
  S3_DEFAULT_BUCKET: "cuisko-test",
  POSTHOG_PROJECT_TOKEN: "phc_test-posthog-project-token",
  POSTHOG_HOST: "https://posthog.test.invalid",
} as const;

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
  { find: /^fonts$/, replacement: at("./src/global/fonts.ts") },
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
          // `*.manual.test.ts` ends in `.test.ts` and lives under `convex/`, so this include claims
          // it unless it is named here — and a hand-run test claimed by the `convex` project is a
          // hand-run test billed on every `pnpm verify`. The top-level `exclude` does NOT reach
          // into a project, so every project that can match one restates the pattern itself.
          exclude: [...AUTOMATIC_EXCLUDE],

          // convex/env.ts throws on a missing key by design (P4), so the test run has to supply a
          // valid environment — the same contract a real deployment has to satisfy.
          env: { ...CONVEX_TEST_ENV },

          /**
           * The C10 `beforeAll` warm-up is where a file's whole import graph gets transformed, and
           * it is deliberately the one place allowed to be slow. Against Vitest's 10s hook default
           * it still lost on a machine also running Metro — `media/images/uploadMany` timed out in
           * its warm-up in 3 of 6 `pnpm verify` runs one day, green on every retry.
           *
           * `testTimeout` stays at the 5s default on purpose: once the warm-up has run, a test that
           * still hits it is importing something nobody warmed, which is exactly the signal to keep.
           */
          hookTimeout: 30_000,
        },
      },
      /**
       * The C1-C18 scripts, which had no runner at all until this project existed, the scripts
       * under `scripts/database/` that talk to a deployment, and the release version logic under
       * `scripts/release/`.
       *
       * Plain node: nothing here needs a DOM or the Convex runtime. The checks' tests spawn the real
       * script as a subprocess; the catalog helpers are imported directly, and they need
       * `@shared/` because the ledger keys a recipe by the same canonical URL `importOne` stores.
       */
      {
        resolve: { alias: { "@shared": at("./shared") } },
        test: {
          name: "scripts",
          environment: "node",
          include: ["scripts/**/*.test.ts"],
          exclude: [...AUTOMATIC_EXCLUDE],
        },
      },
      /**
       * The tests you run by hand — a real Vitest project that `pnpm test` deliberately never runs.
       *
       * What every file in here shares is its INVOCATION, not its subject: nothing runs it
       * automatically. Today that is the model bake-offs, which call OpenRouter for real and cost
       * money and minutes; tomorrow it is anything else that must not fire on every commit — a
       * smoke test against a live deployment, a migration rehearsal. `manual` names the property
       * they actually have in common, which is why it is not called `evals`.
       *
       * It is a project rather than a file hidden outside every include glob, because C10 rule 1
       * asks Vitest which files it claims — a test left unclaimed reads to the next author as
       * coverage that already exists, and nothing would ever have told them otherwise.
       *
       * So the exclusion lives in ONE place: the `test` and `test:watch` scripts in package.json
       * name their three projects. Add a fourth automatic project there when you add one — a
       * project missing from that list is a project that never runs.
       *
       * `node` rather than `edge-runtime`: nothing here is Convex function code, and a hand-run
       * test is likelier to want the real Node surface than the deployment's isolate.
       */
      {
        resolve: { alias: { "@convex": at("./convex"), "@shared": at("./shared") } },
        test: {
          name: "manual",
          environment: "node",
          include: ["**/*.manual.test.ts"],
          exclude: ["**/node_modules/**", "**/.claude/worktrees/**"],
          // Dozens of model calls plus a judge, and a cold route on OpenRouter can take a minute
          // alone.
          testTimeout: 20 * 60_000,
          // These answer a question; they do not gate anything. The bake-off runs its candidates
          // in parallel inside one file, so that file must not be sharded across workers.
          fileParallelism: false,

          /**
           * Progress has to reach the terminal WHILE the run is happening, which takes both of
           * these — a `manual` test is minutes long and a silent terminal is indistinguishable
           * from a hung one.
           *
           * `disableConsoleIntercept` stops Vitest buffering `console.log` and replaying it
           * under a `stdout |` heading once the file finishes; the log goes straight to the real
           * stdout instead.
           *
           * That is only half of it. The default reporter's live-updating summary panel redraws
           * over anything printed beneath it, so the `test:manual` script also passes
           * `--reporter.summary=false`. It lives there rather than here because `reporters` is a
           * ROOT-level Vitest option — setting it in a project is a type error, and setting it at
           * the root would take the summary away from `pnpm test` too.
           */
          disableConsoleIntercept: true,
          /**
           * The placeholders are the Zod-validated contract of `convex/env.ts`, which loads
           * transitively through the tool under test — it throws at import time without them, and
           * two of the three are irrelevant to a benchmark that never opens a Convex connection.
           *
           * `.env.local` then overrides `OPENROUTER_API_KEY` with the real one, and an explicit
           * `OPENROUTER_API_KEY=… pnpm test:manual` overrides that in turn. A run left on the
           * placeholder is caught in the test with a message saying so, rather than failing nine
           * times with an auth error that reads like nine bad models.
           */
          env: {
            ...CONVEX_TEST_ENV,
            ...dotEnvLocal(),
            ...(process.env.OPENROUTER_API_KEY ? { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY } : {}),
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
          exclude: [...AUTOMATIC_EXCLUDE],
          setupFiles: ["./test/setup.dom.ts"],
        },
      },
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.expo/**", "**/.history/**", "**/.claude/worktrees/**"],
  },
});
