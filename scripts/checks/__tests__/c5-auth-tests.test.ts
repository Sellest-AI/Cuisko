/**
 * C5's own tests.
 *
 * C5 exists because C1 cannot see everything. C1 proves the export name matches the builder — but a
 * builder that is correctly named and no longer gates anything keeps every name consistent and
 * every C1 assertion green. Only a test calling the wrong caller catches that, so C5 demands one
 * for every gated export rather than for the ones somebody remembered.
 *
 * Its three failure modes are graded, and the grading is the part worth pinning: no test file at
 * all, a test file that never mentions the export, and a test file that mentions it but only ever
 * asserts the happy path. The third is the one that looks like coverage and is not.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

const runC5 = (files: Record<string, string>) =>
  runCheck(
    "c5-auth-tests.mjs",
    Object.fromEntries(Object.entries(files).map(([name, body]) => [`convex/router/${name}`, body])),
  );

const GATED_EXPORT = "export const authed = authQuery({});";

afterEach(cleanupTrees);

describe("a gated export needs a rejection test", () => {
  it("rejects a gated export with no test file", () => {
    const { code, output } = runC5({ "getOne.ts": GATED_EXPORT });

    expect(code).toBe(1);
    expect(output).toContain('A6 — "authed" is access-gated and has no test file');
  });

  it("rejects a test file that never references the export", () => {
    const { code, output } = runC5({
      "getOne.ts": GATED_EXPORT,
      "__tests__/getOne.test.ts": 'it("works", async () => { await expect(x).rejects.toThrow(); });',
    });

    expect(code).toBe(1);
    expect(output).toContain('never references the "authed" export');
  });

  it("rejects a test that references the export but only asserts the happy path", () => {
    // The failure mode that reads as coverage: the export is named, the test passes, and nothing
    // in it ever proves the wrong caller is turned away.
    const { code, output } = runC5({
      "getOne.ts": GATED_EXPORT,
      "__tests__/getOne.test.ts": 'it("returns it", async () => { await api.authed({}); });',
    });

    expect(code).toBe(1);
    expect(output).toContain("no rejection assertion for the gated exports");
  });

  it("accepts a test that references the export and asserts a rejection", () => {
    const { code } = runC5({
      "getOne.ts": GATED_EXPORT,
      "__tests__/getOne.test.ts":
        'it("turns away a stranger", async () => { await expect(api.authed({})).rejects.toThrow(); });',
    });

    expect(code).toBe(0);
  });
});

describe("what is exempt", () => {
  it("exempts anon, which has no caller to reject", () => {
    const { code } = runC5({ "list.ts": "export const anon = publicQuery({});" });

    expect(code).toBe(0);
  });

  it("exempts _internal, which Convex refuses to clients at the platform level", () => {
    const { code } = runC5({ "persist.ts": "export const _internal = internalMutation({});" });

    expect(code).toBe(0);
  });

  it("demands a test for admin and server too, not only authed", () => {
    const { code, output } = runC5({
      "getOne.ts": "export const admin = adminQuery({});\nexport const server = serverQuery({});",
    });

    expect(code).toBe(1);
    expect(output).toContain('"admin" is access-gated');
    expect(output).toContain('"server" is access-gated');
  });
});
