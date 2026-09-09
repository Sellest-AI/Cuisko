/**
 * C5 — every access-gated export has a test proving the wrong caller is rejected (A6).
 *
 * C1 proves the export NAME matches the BUILDER. That catches `export const admin = authQuery`,
 * which was two live IDORs in the predecessor. What it cannot catch is a builder that is correctly
 * named but does not actually gate — a wrapper refactor that drops the role check keeps every name
 * consistent and every C1 assertion green.
 *
 * So the gate itself needs a test, and the test needs to exist for every gated export rather than
 * for the ones somebody remembered. The predecessor had no tests at all, which is why its
 * `adminQuery` shipped for the life of the project injecting the wrong context.
 *
 * `anon` is exempt: there is no caller to reject. `_internal` is exempt because Convex refuses
 * client calls to internal functions at the platform level — the gate is not ours to test.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { lineOf, listFiles, parse, relative, report, ROOT, ts } from "./_lib.mjs";

/** Exports whose whole purpose is to turn the wrong caller away. */
const GATED = new Set(["authed", "admin", "server"]);

/** Any of these in the test body reads as "this asserts a rejection". */
const REJECTION_MARKERS = [
  ".rejects",
  "toThrow",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "Unauthorized",
];

const findings = [];

for (const file of listFiles(path.join(ROOT, "convex", "router"))) {
  if (file.endsWith(".test.ts") || file.includes("__tests__")) continue;

  const source = parse(file);
  const base = path.basename(file, ".ts");
  const testFile = path.join(path.dirname(file), "__tests__", `${base}.test.ts`);

  let testBody = null;
  try {
    testBody = readFileSync(testFile, "utf8");
  } catch {
    testBody = null; // reported per-export below, so the message can name what is missing
  }

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;

    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !GATED.has(decl.name.text)) continue;

      const name = decl.name.text;
      const at = { file: relative(file), line: lineOf(source, decl) };
      const testPath = relative(testFile);

      if (testBody === null) {
        findings.push({
          ...at,
          message: `A6 — "${name}" is access-gated and has no test file.`,
          fix: `Create ${testPath} with a case asserting a caller without the required access is rejected.`,
        });
        continue;
      }

      if (!testBody.includes(name)) {
        findings.push({
          ...at,
          message: `A6 — ${testPath} never references the "${name}" export.`,
          fix: `Add a case calling "${name}" as the wrong caller and asserting it is rejected.`,
        });
        continue;
      }

      if (!REJECTION_MARKERS.some((marker) => testBody.includes(marker))) {
        findings.push({
          file: testPath,
          message: `A6 — no rejection assertion for the gated exports in ${base}.ts.`,
          fix:
            "A test that only checks the happy path does not prove the gate works. Assert the " +
            "wrong caller is rejected — e.g. await expect(...).rejects.toThrow().",
        });
      }
    }
  }
}

report("C5 authorization tests on gated exports", findings);
