/**
 * `_lib.mjs` — the shared floor under C1-C13.
 *
 * This is the highest-leverage file in `scripts/checks/`, and the one whose failure is hardest
 * to see.
 * Every check reaches the files it inspects through `listFiles`. If one directory silently stopped
 * being descended into — one bad entry in IGNORED_DIRS, one wrong `endsWith` — all ten checks would
 * inspect less, find nothing, and print ten green check marks. There is no downstream signal for
 * that: the repo looks exactly as it does when every rule is being enforced.
 *
 * So the assertions here are mostly about what `listFiles` must NOT skip, and about `report`
 * exiting non-zero — the two behaviours everything else is built on.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import * as lib from "../_lib.mjs";

import { cleanupTrees, makeTree } from "./_harness";

/**
 * `_lib.mjs` is plain JavaScript, so its exports arrive untyped.
 *
 * Restating the contract here rather than shipping a `_lib.d.ts` keeps the declaration in the one
 * place that reads it, and it is the only written description of that contract anywhere — if a
 * signature below stops matching the module, these tests stop compiling, which is the point.
 */
const { lineOf, listFiles, parse, relative, ROOT } = lib as unknown as {
  ROOT: string;
  listFiles: (dir: string, ext?: string) => string[];
  relative: (file: string) => string;
  parse: (file: string) => ts.SourceFile;
  lineOf: (source: ts.SourceFile, node: ts.Node) => number;
};

const LIB = fileURLToPath(new URL("../_lib.mjs", import.meta.url));

afterEach(cleanupTrees);

/**
 * Runs `code` in a fresh node process with `_lib.mjs` importable as `probe`.
 *
 * An `undefined` in `env` means "unset this variable", and has to be deleted rather than passed —
 * Node stringifies an undefined value, so leaving it in would set CHECK_ROOT to "undefined" and
 * silently test a path named after the bug.
 */
const inNode = (code: string, env: Record<string, string | undefined> = {}) => {
  const source = `import * as probe from ${JSON.stringify(`file://${LIB.split(path.sep).join("/")}`)};\n${code}`;

  const merged = { ...process.env, ...env };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete merged[key];

  try {
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", source], {
      encoding: "utf8",
      env: merged,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { code: failure.status, output: `${failure.stdout}${failure.stderr}` };
  }
};

describe("listFiles", () => {
  it("finds files at every depth, not just the top level", () => {
    const root = makeTree({
      "top.ts": "",
      "a/one.ts": "",
      "a/b/two.ts": "",
      "a/b/c/three.ts": "",
    });

    const found = listFiles(root).map((f) => path.basename(f)).sort();

    expect(found).toEqual(["one.ts", "three.ts", "top.ts", "two.ts"]);
  });

  it("filters by extension, and does not match a suffix that merely contains it", () => {
    const root = makeTree({ "a.ts": "", "b.tsx": "", "c.mts": "", "d.js": "" });

    const found = listFiles(root, ".ts").map((f) => path.basename(f));

    // ".tsx" and ".mts" both contain ".ts"; only the exact suffix counts.
    expect(found).toEqual(["a.ts"]);
  });

  it("skips the directories a check must never inspect", () => {
    const root = makeTree({
      "kept.ts": "",
      "node_modules/dep.ts": "",
      "convex/_generated/api.ts": "",
      ".history/old.ts": "",
      ".expo/cache.ts": "",
      "dist/build.ts": "",
    });

    const found = listFiles(root).map((f) => path.basename(f));

    expect(found).toEqual(["kept.ts"]);
  });

  it("descends into a directory whose name merely starts with an ignored one", () => {
    // IGNORED_DIRS is matched by equality, not by prefix. If it ever became a prefix match,
    // "distribution/" and "node_modules_backup/" would vanish from every check silently.
    const root = makeTree({ "distribution/real.ts": "", "disturbing/also-real.ts": "" });

    const found = listFiles(root).map((f) => path.basename(f)).sort();

    expect(found).toEqual(["also-real.ts", "real.ts"]);
  });

  it("returns nothing for a directory that does not exist, rather than throwing", () => {
    // Checks call it on paths like convex/schema/ that a young repo may not have yet.
    expect(listFiles(path.join(makeTree({}), "absent"))).toEqual([]);
  });
});

describe("relative", () => {
  it("renders a path under ROOT with forward slashes", () => {
    const file = path.join(ROOT, "convex", "schema", "users.ts");

    // Findings are printed as file:line and read on Windows and CI alike, so the separator has to
    // be normalised rather than inherited from the platform.
    expect(relative(file)).toBe("convex/schema/users.ts");
  });
});

describe("parse and lineOf", () => {
  it("reports a 1-based line number", () => {
    const root = makeTree({ "s.ts": "const a = 1;\nconst b = 2;\nconst c = 3;\n" });
    const source = parse(path.join(root, "s.ts"));

    const lines = source.statements.map((node) => lineOf(source, node));

    expect(lines).toEqual([1, 2, 3]);
  });

  it("sets parent pointers, which every check relies on to walk upward", () => {
    const root = makeTree({ "s.ts": "export const a = 1;" });
    const source = parse(path.join(root, "s.ts"));

    const statement = source.statements[0];
    if (!statement || !ts.isVariableStatement(statement)) {
      throw new Error("fixture is not a variable statement");
    }

    expect(statement.declarationList.declarations[0]?.parent).toBeDefined();
  });
});

describe("report", () => {
  it("exits 0 and prints the check name when there are no findings", () => {
    const { code, output } = inNode('probe.report("C0 nothing wrong", []);');

    expect(code).toBe(0);
    expect(output).toContain("✅ C0 nothing wrong");
  });

  it("exits 1 when there are findings, so the commit is actually refused", () => {
    // The single most important line in scripts/checks/. If report stopped exiting non-zero,
    // every check would keep printing its findings and `pnpm verify` would pass anyway.
    const { code, output } = inNode(
      'probe.report("C0 something wrong", [{ file: "a.ts", line: 7, message: "boom", fix: "do it" }]);',
    );

    expect(code).toBe(1);
    expect(output).toContain("a.ts:7");
    expect(output).toContain("boom");
    expect(output).toContain("Fix: do it");
  });
});

describe("ROOT", () => {
  it("is this repo when CHECK_ROOT is unset", () => {
    const { output } = inNode("console.log(probe.ROOT);", { CHECK_ROOT: undefined });

    expect(output.trim()).toBe(path.resolve(ROOT));
  });

  it("follows CHECK_ROOT when it is set", () => {
    const root = makeTree({});
    const { output } = inNode("console.log(probe.ROOT);", { CHECK_ROOT: root });

    expect(output.trim()).toBe(path.resolve(root));
  });
});
