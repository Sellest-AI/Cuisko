/**
 * C2 — router files stay thin.
 *
 * A crude proxy for a rule that cannot be expressed exactly: a router file should contain only
 * imports, validators, procedure wrappers, and handlers that shape arguments and call into
 * `functions/`. Loops and domain branching belong one layer down.
 *
 * Crude, but it makes the boundary observable — and every violation in the predecessor project
 * exceeded this line count. When a file legitimately needs several registered steps, move them
 * to a sibling `<operation>.steps.ts`.
 */
import path from "node:path";

import { listFiles, relative, report, ROOT } from "./_lib.mjs";
import { readFileSync } from "node:fs";

const MAX_LINES = 80;

const findings = listFiles(path.join(ROOT, "convex", "router"))
  .filter((file) => !file.endsWith(".test.ts"))
  .flatMap((file) => {
    const lines = readFileSync(file, "utf8").split("\n").length;
    if (lines <= MAX_LINES) return [];
    return [
      {
        file: relative(file),
        line: MAX_LINES + 1,
        message: `${lines} lines — the cap is ${MAX_LINES}.`,
        fix: "Move domain logic into convex/functions/, or split steps into <operation>.steps.ts.",
      },
    ];
  });

report(`C2 router files ≤ ${MAX_LINES} lines`, findings);
