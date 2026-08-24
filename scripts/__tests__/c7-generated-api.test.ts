/**
 * C7's own tests.
 *
 * `convex/_generated/` is committed because CI has no Convex credentials and cannot run codegen.
 * Committed generated output goes stale, and C7 is the bound on that: it compares the SET of
 * modules on disk against the set the manifest registers, in both directions.
 *
 * Both directions are the point. A file added without codegen and a file deleted without codegen
 * fail differently and are found by different halves of the check, so a regression that loses one
 * direction still passes every test that only exercises the other.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

/** The manifest shape codegen emits: quoted for nested paths, bare for top-level identifiers. */
const manifest = (names: string[]) =>
  `export declare const fullApi: {\n${names
    .map((name) =>
      /^[A-Za-z_$][\w$]*$/.test(name)
        ? `  ${name}: typeof ${name};`
        : `  "${name}": typeof ${name.replace(/\//g, "_")};`,
    )
    .join("\n")}\n};`;

const runC7 = (modules: string[], registered: string[]) =>
  runCheck("c7-generated-api.mjs", {
    "convex/_generated/api.d.ts": manifest(registered),
    ...Object.fromEntries(modules.map((name) => [`convex/${name}.ts`, "export const anon = 1;"])),
  });

afterEach(cleanupTrees);

it("accepts a manifest that matches the tree exactly", () => {
  const { code } = runC7(["procedures", "router/users/getOne"], ["procedures", "router/users/getOne"]);

  expect(code).toBe(0);
});

it("rejects a module on disk that codegen has not seen", () => {
  const { code, output } = runC7(["procedures", "router/users/getOne"], ["procedures"]);

  expect(code).toBe(1);
  expect(output).toContain("convex/router/users/getOne.ts");
  expect(output).toContain("Not registered in _generated/api.d.ts");
});

it("rejects a manifest entry whose file is gone", () => {
  const { code, output } = runC7(["procedures"], ["procedures", "router/users/deleted"]);

  expect(code).toBe(1);
  expect(output).toContain('Registers "router/users/deleted", which no longer exists on disk');
});

describe("what is not a module", () => {
  it("does not expect schema.ts to be registered", () => {
    const { code } = runC7(["procedures", "schema"], ["procedures"]);

    expect(code).toBe(0);
  });

  it("does not expect a dotted filename to be registered", () => {
    // Convex's bundler skips any filename containing extra dots, which is what keeps auth.config.ts
    // and every *.test.ts out of the API.
    const { code } = runCheck("c7-generated-api.mjs", {
      "convex/_generated/api.d.ts": manifest(["procedures"]),
      "convex/procedures.ts": "export const anon = 1;",
      "convex/auth.config.ts": "export default {};",
      "convex/router/users/getOne.test.ts": "it('x', () => {});",
    });

    expect(code).toBe(0);
  });

  it("does not expect anything under __tests__ to be registered", () => {
    const { code } = runC7(["procedures", "router/users/__tests__/helpers"], ["procedures"]);

    expect(code).toBe(0);
  });
});
