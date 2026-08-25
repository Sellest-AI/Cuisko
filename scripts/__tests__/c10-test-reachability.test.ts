/**
 * C10's own tests.
 *
 * C10 guards the failure this whole harness exists because of: a test file that no runner collects.
 * It reports nothing, it never goes red, and it reads to the next author as coverage that already
 * exists. This repo shipped exactly that — the runner's `include` was `**\/*.test.ts`, so every
 * `.tsx` test could be written, committed, reviewed and never once executed.
 *
 * C10 asks Vitest which files it claims rather than restating the globs, which is the right design
 * and the reason its fixture needs a stand-in `vitest.mjs`: the check's own logic is the comparison
 * between what is on disk and whatever that answer was, so the answer is the thing to vary.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

/**
 * Stands in for `vitest list --filesOnly --json`.
 *
 * It resolves the paths against its own location so the JSON carries absolute paths, exactly as
 * the real Vitest does — C10 compares them to `ROOT`, so a relative path would resolve against the
 * wrong tree and the test would pass for the wrong reason.
 */
const fakeVitest = (claimed: string[]) => `
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const claimed = ${JSON.stringify(claimed)};

console.log(JSON.stringify(claimed.map((f) => ({ file: path.join(root, f), projectName: "app" }))));
`;

const runC10 = (files: Record<string, string>, claimed: string[]) =>
  runCheck("c10-test-reachability.mjs", {
    "node_modules/vitest/vitest.mjs": fakeVitest(claimed),
    ...files,
  });

afterEach(cleanupTrees);

describe("1 — every test file is collected", () => {
  it("rejects a test file no project claims", () => {
    const { code, output } = runC10({ "src/ui/__tests__/badge.test.tsx": "it('x', () => {});" }, []);

    expect(code).toBe(1);
    expect(output).toContain("src/ui/__tests__/badge.test.tsx");
    expect(output).toContain("No Vitest project collects this file, so it never runs");
  });

  it("accepts a test file that is claimed", () => {
    const file = "src/ui/__tests__/badge.test.tsx";
    const { code } = runC10({ [file]: "it('x', () => {});" }, [file]);

    expect(code).toBe(0);
  });

  it("checks .tsx as well as .ts — the extension that was silently uncollected here", () => {
    const { code, output } = runC10(
      {
        "src/__tests__/a.test.ts": "it('x', () => {});",
        "src/__tests__/b.test.tsx": "it('x', () => {});",
      },
      ["src/__tests__/a.test.ts"],
    );

    expect(code).toBe(1);
    expect(output).toContain("src/__tests__/b.test.tsx");
    expect(output).not.toContain("src/__tests__/a.test.ts");
  });
});

describe("2 — every _model/ file has a test", () => {
  it("rejects a _model/ file with no test beside it", () => {
    const { code, output } = runC10(
      { "src/modules/recipes/_model/model.ts": "export const x = 1;" },
      [],
    );

    expect(code).toBe(1);
    expect(output).toContain("Domain logic in _model/ with no test");
  });

  it("accepts a _model/ file whose test sits in its __tests__/", () => {
    const test = "src/modules/recipes/_model/__tests__/model.test.ts";
    const { code } = runC10(
      {
        "src/modules/recipes/_model/model.ts": "export const x = 1;",
        [test]: "it('x', () => {});",
      },
      [test],
    );

    expect(code).toBe(0);
  });

  it("does not demand a test for a test, nor for code outside _model/", () => {
    const { code } = runC10({ "src/modules/recipes/_hooks/useRecipes.ts": "export const x = 1;" }, []);

    expect(code).toBe(0);
  });
});

describe("3 — every test sits in a __tests__/ folder", () => {
  it("rejects a test co-located with its subject", () => {
    const file = "src/modules/recipes/_hooks/useRecipes.test.ts";
    const { code, output } = runC10({ [file]: "it('x', () => {});" }, [file]);

    expect(code).toBe(1);
    expect(output).toContain("Test file outside a __tests__/ folder");
    expect(output).toContain("src/modules/recipes/_hooks/__tests__/useRecipes.test.ts");
  });

  it("rejects a co-located _model/ test — the exception this rule removed", () => {
    // `_model/` and `_hooks/` used to be exempt. A test asserting the old shape is accepted would
    // still pass against a check that had simply stopped looking, so the assertion is the reverse.
    const file = "src/modules/recipes/_model/model.test.ts";
    const { code, output } = runC10(
      { "src/modules/recipes/_model/model.ts": "export const x = 1;", [file]: "it('x', () => {});" },
      [file],
    );

    expect(code).toBe(1);
    expect(output).toContain("Test file outside a __tests__/ folder");
  });

  it("accepts a test inside a __tests__/ folder at any depth", () => {
    const files = [
      "shared/__tests__/recipes.test.ts",
      "src/modules/recipes/_hooks/__tests__/useRecipes.test.ts",
      "convex/router/cellars/__tests__/addToCellar.test.ts",
    ];
    const { code } = runC10(
      Object.fromEntries(files.map((f) => [f, "it('x', () => {});"])),
      files,
    );

    expect(code).toBe(0);
  });

  it("names the exact path to move the file to, so the fix needs no thought", () => {
    const file = "convex/functions/ingredients/ingredientCatalog.test.ts";
    const { code, output } = runC10({ [file]: "it('x', () => {});" }, [file]);

    expect(code).toBe(1);
    expect(output).toContain("convex/functions/ingredients/__tests__/ingredientCatalog.test.ts");
  });
});
