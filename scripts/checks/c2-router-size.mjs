/**
 * C2 — router files stay thin, and split for one reason only.
 *
 * The line cap is a crude proxy for a rule that cannot be expressed exactly: a router file should
 * contain only imports, validators, procedure wrappers, and handlers that shape arguments and call
 * into `functions/`. Loops and domain branching belong one layer down.
 *
 * Crude, but it makes the boundary observable — and every violation in the predecessor project
 * exceeded this line count.
 *
 * The rest of this check exists because the cap has an obvious wrong answer. Splitting an oversized
 * router into a sibling satisfies the cap and moves nothing; the domain logic is still a layer too
 * high. So a second file for one operation is a violation unless the operation genuinely could not
 * be one module — which, in Convex, means exactly one thing: `"use node"`. The runtime is decided
 * per module (`determineEnvironment`, called once per entry point) and the Node runtime hosts only
 * actions, so an operation needing a Node API *and* a mutation is forced across two.
 *
 * The split is directional, and the checks below enforce that rather than merely counting files:
 * `<operation>.ts` stays in the isolate runtime with the entry point and the mutations, and
 * `<operation>Node.ts` carries the directive and only what needs it. See CONVENTIONS §2.2.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { listFiles, relative, report, ROOT } from "./_lib.mjs";

const MAX_LINES = 90;

const USE_NODE = /^\s*("|')use node("|');?\s*$/m;

const ROUTER = path.join(ROOT, "convex", "router");

const sources = new Map(
  listFiles(ROUTER)
    .filter((file) => !file.endsWith(".test.ts"))
    .map((file) => [file, readFileSync(file, "utf8")]),
);

const tooLong = [...sources].flatMap(([file, source]) => {
  const lines = source.split("\n").length;
  if (lines <= MAX_LINES) return [];
  return [
    {
      file: relative(file),
      line: MAX_LINES + 1,
      message: `${lines} lines — the cap is ${MAX_LINES}.`,
      fix: 'Move domain logic into convex/functions/. A sibling file is not the answer: an operation splits only for "use node" (CONVENTIONS §2.2).',
    },
  ];
});

/**
 * The Node half has to be the Node half.
 *
 * A `*Node.ts` without the directive is one of two mistakes, and the fix differs: either the split
 * was made for the line cap, which `functions/` is the answer to, or the directive was dropped and
 * every export in it is now running in the isolate runtime the Node APIs it calls do not exist in.
 */
const namedNodeButIsNot = [...sources].flatMap(([file, source]) => {
  if (!file.endsWith("Node.ts") || USE_NODE.test(source)) return [];

  return [
    {
      file: relative(file),
      line: 1,
      message: 'named as the Node half but does not declare "use node".',
      fix: "Add the directive, or merge it back and move the domain logic into convex/functions/ — the 90-line cap is not a reason to split (CONVENTIONS §2.2).",
    },
  ];
});

/**
 * A `*Node.ts` with no operation beside it never needed the suffix: an operation that is entirely
 * a Node action is legitimately one file, and the plain name is the one that says so.
 */
const nodeHalfWithNoOperation = [...sources].flatMap(([file]) => {
  if (!file.endsWith("Node.ts")) return [];
  const operation = file.replace(/Node\.ts$/, ".ts");
  if (sources.has(operation)) return [];

  return [
    {
      file: relative(file),
      line: 1,
      message: `no ${relative(operation)} beside it — nothing was split.`,
      fix: "Rename it to the operation. A wholly-Node operation is one file (CONVENTIONS §2.2).",
    },
  ];
});

/**
 * And the isolate half has to stay the isolate half.
 *
 * `"use node"` on both sides means the split bought nothing — the entry point and the mutations
 * went to Node along with the one action that needed it, which is the whole cost the directional
 * rule exists to avoid. A mutation cannot be registered there at all.
 */
const bothHalvesInNode = [...sources].flatMap(([file, source]) => {
  if (file.endsWith("Node.ts") || !USE_NODE.test(source)) return [];
  const nodeHalf = file.replace(/\.ts$/, "Node.ts");
  if (!sources.has(nodeHalf)) return [];

  return [
    {
      file: relative(file),
      line: 1,
      message: `declares "use node" while ${relative(nodeHalf)} exists — both halves run in Node.`,
      fix: "Drop the directive here and keep the entry point and the mutations in the isolate runtime; an isolate action reaches a Node one through ctx.runAction (CONVENTIONS §2.2).",
    },
  ];
});

/**
 * `*.steps.ts` is the shape this convention used to name, and it is the dangerous one: the bundler
 * skips any basename with more than one dot, silently, so those exports never register and nothing
 * else in the repo notices — the generated API is derived from the same filtered tree.
 */
const neverRegistered = listFiles(ROUTER)
  .filter((file) => !file.endsWith(".test.ts"))
  .filter((file) => (path.basename(file).match(/\./g) ?? []).length > 1)
  .map((file) => ({
    file: relative(file),
    line: 1,
    message:
      "extra dot in the filename — Convex's bundler skips this file, so nothing it exports is registered.",
    fix: "Rename to a single dot (<operation>Node.ts). See CONVENTIONS §1 and §2.2.",
  }));

report(`C2 router files ≤ ${MAX_LINES} lines, split only for "use node"`, [
  ...tooLong,
  ...namedNodeButIsNot,
  ...nodeHalfWithNoOperation,
  ...bothHalvesInNode,
  ...neverRegistered,
]);
