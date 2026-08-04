/**
 * C7 — `convex/_generated/api.d.ts` still lists every Convex module, and only those.
 *
 * `convex/_generated/` is committed on purpose: CI has no Convex credentials, so it cannot run
 * codegen, and without these files `tsc --noEmit` fails on every import of `api` or `dataModel`.
 * Committing generated output has an obvious hazard — it goes stale — so this check bounds it.
 *
 * The hazard is narrower than it looks, and worth understanding before trusting this check:
 *
 *   • `api.js` is `anyApi` — fully generic. Nothing to go stale at runtime.
 *   • `api.d.ts` maps module paths to `typeof <the real module>`. It is a **manifest**, not a
 *     snapshot of signatures — so changing a function's arguments or return type needs no
 *     regeneration at all; the types are read from the source file at typecheck time.
 *
 * So `_generated` can only drift when the SET of modules changes: a file added, deleted or
 * renamed without re-running codegen. That is exactly what this compares, and it needs no
 * deployment to do it — unlike `npx convex codegen`, which connects.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { listFiles, relative, report, ROOT } from "./_lib.mjs";

const findings = [];

const API_FILE = path.join(ROOT, "convex", "_generated", "api.d.ts");
const CONVEX_DIR = path.join(ROOT, "convex");

/**
 * `schema.ts` defines the database, not functions — Convex consumes it separately and never
 * registers it as a module. Everything else under convex/ is fair game.
 */
const NOT_A_MODULE = new Set(["schema"]);

/* ── What is registered ───────────────────────────────────────────────────────────────── */

const source = readFileSync(API_FILE, "utf8");

/**
 * Entries look like `  "router/users/getOne": typeof router_users_getOne;` for nested paths and
 * `  procedures: typeof procedures;` for top-level ones, which are valid identifiers and so are
 * emitted unquoted.
 */
const registered = new Set([
  ...[...source.matchAll(/^\s*"([^"]+)":\s*typeof\s/gm)].map((m) => m[1]),
  ...[...source.matchAll(/^\s*([A-Za-z_$][\w$]*):\s*typeof\s/gm)].map((m) => m[1]),
]);

/* ── What is on disk ──────────────────────────────────────────────────────────────────── */

const onDisk = new Set(
  listFiles(CONVEX_DIR)
    .map((file) => relative(file).replace(/^convex\//, "").replace(/\.ts$/, ""))
    .filter((name) => {
      // Convex's bundler skips any filename containing extra dots — which is what keeps
      // `*.test.ts`, `*.d.ts`, `auth.config.ts` and `convex.config.ts` out of the API.
      if (name.includes(".")) return false;
      if (name.split("/").includes("__tests__")) return false;
      return !NOT_A_MODULE.has(name);
    }),
);

/* ── Compare, both directions ─────────────────────────────────────────────────────────── */

for (const name of onDisk) {
  if (registered.has(name)) continue;

  findings.push({
    file: `convex/${name}.ts`,
    message: `Not registered in _generated/api.d.ts — codegen has not seen this file.`,
    fix: "Run `npx convex codegen` (or `pnpm convex:dev`) and commit convex/_generated/.",
  });
}

for (const name of registered) {
  if (onDisk.has(name)) continue;

  findings.push({
    file: "convex/_generated/api.d.ts",
    message: `Registers "${name}", which no longer exists on disk.`,
    fix: "Run `npx convex codegen` (or `pnpm convex:dev`) and commit convex/_generated/.",
  });
}

report("C7 generated API matches the convex/ tree", findings);
