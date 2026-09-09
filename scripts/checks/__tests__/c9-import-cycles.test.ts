/**
 * C9's own tests.
 *
 * Metro does not fail on an import cycle. It hands the second module a partially-initialised
 * export, so the symptom is `undefined is not a function` on one import order and not another —
 * a defect that survives review because neither file looks wrong. C9 is the only thing in the
 * repo that sees it.
 *
 * The cases below lean on the two things that make a cycle hard to spot by eye: it can run through
 * a barrel (`hooks.ts` re-exporting an interior file), and it can run through an alias, where
 * neither specifier looks like a relative path back to the importer.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

/** C9 reads the alias table out of tsconfig, so every fixture needs one. */
const TSCONFIG = JSON.stringify({ compilerOptions: { paths: { "~/*": ["./src/*"] } } });

const runC9 = (files: Record<string, string>) =>
  runCheck("c9-import-cycles.mjs", { "tsconfig.json": TSCONFIG, ...files });

afterEach(cleanupTrees);

describe("cycles it must catch", () => {
  it("catches two files importing each other", () => {
    const { code, output } = runC9({
      "src/a.ts": 'import { b } from "./b";\nexport const a = b;',
      "src/b.ts": 'import { a } from "./a";\nexport const b = a;',
    });

    expect(code).toBe(1);
    expect(output).toContain("Import cycle:");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
  });

  it("catches a longer cycle through a third file", () => {
    const { code, output } = runC9({
      "src/a.ts": 'import "./b";',
      "src/b.ts": 'import "./c";',
      "src/c.ts": 'import "./a";',
    });

    expect(code).toBe(1);
    expect(output).toContain("src/c.ts");
  });

  it("catches a cycle that runs through an alias rather than a relative path", () => {
    const { code, output } = runC9({
      "src/modules/a.ts": 'import "~/modules/b";',
      "src/modules/b.ts": 'import "~/modules/a";',
    });

    expect(code).toBe(1);
    expect(output).toContain("src/modules/a.ts → src/modules/b.ts → src/modules/a.ts");
  });

  it("catches a cycle through a barrel's index file", () => {
    const { code, output } = runC9({
      "src/ui/index.ts": 'export * from "./button";',
      "src/ui/button.ts": 'import "./index";',
    });

    expect(code).toBe(1);
    expect(output).toContain("Import cycle:");
    expect(output).toContain("src/ui/index.ts");
  });

  it("reports one cycle once, not once per file in it", () => {
    const { output } = runC9({
      "src/a.ts": 'import "./b";',
      "src/b.ts": 'import "./a";',
    });

    expect(output.match(/Import cycle:/g)).toHaveLength(1);
  });
});

describe("what is not a cycle", () => {
  it("accepts a plain chain with no way back", () => {
    const { code } = runC9({
      "src/a.ts": 'import "./b";',
      "src/b.ts": 'import "./c";',
      "src/c.ts": "export const c = 1;",
    });

    expect(code).toBe(0);
  });

  it("ignores a type-only edge, which is erased before Metro sees it", () => {
    const { code } = runC9({
      "src/a.ts": 'import type { B } from "./b";\nexport type A = B;',
      "src/b.ts": 'import { a } from "./a";\nexport type B = string;',
    });

    expect(code).toBe(0);
  });

  it("ignores bare package specifiers, which this repo cannot fix anyway", () => {
    const { code } = runC9({ "src/a.ts": 'import "react-native";\nimport "expo-router";' });

    expect(code).toBe(0);
  });

  it("ignores a diamond, where two files share a dependency", () => {
    const { code } = runC9({
      "src/a.ts": 'import "./shared";',
      "src/b.ts": 'import "./shared";',
      "src/shared.ts": "export const s = 1;",
    });

    expect(code).toBe(0);
  });
});
