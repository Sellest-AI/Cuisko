/**
 * C1's own tests.
 *
 * C1 is the check the repo values most: it is the one that catches an export whose NAME promises
 * an access level its BUILDER does not enforce. That exact shape — `export const admin =
 * authQuery(...)` taking `userId` from the caller — shipped twice in the predecessor project and
 * was a live IDOR for its whole life, because nothing was looking.
 *
 * A check that stops looking looks identical to one that finds nothing. So the first case below is
 * the predecessor's bug verbatim: if C1 ever stops failing it, that test goes red.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

const runC1 = (files: Record<string, string>) =>
  runCheck(
    "c1-export-contract.mjs",
    Object.fromEntries(Object.entries(files).map(([name, body]) => [`convex/router/${name}`, body])),
  );

afterEach(cleanupTrees);

describe("the name must match the builder", () => {
  it("rejects an admin export built with authQuery — the predecessor's live IDOR", () => {
    const { code, output } = runC1({
      "getOne.ts": 'export const admin = authQuery({ args: { userId: v.id("users") } });',
    });

    expect(code).toBe(1);
    expect(output).toContain("does not enforce the `admin` access level");
  });

  it("accepts an admin export built with adminQuery", () => {
    const { code } = runC1({ "getOne.ts": "export const admin = adminQuery({ args: {} });" });

    expect(code).toBe(0);
  });

  it("sees through a curried builder such as ownedMutation('recipes')", () => {
    const { code } = runC1({
      "update.ts": 'export const authed = ownedMutation("recipes")({ args: {} });',
    });

    expect(code).toBe(0);
  });

  it("rejects a server export built with an authed builder", () => {
    const { code, output } = runC1({ "sync.ts": "export const server = authMutation({});" });

    expect(code).toBe(1);
    expect(output).toContain("does not enforce the `server` access level");
  });
});

describe("the export grammar", () => {
  it("rejects a name outside the grammar, however well built", () => {
    const { code, output } = runC1({ "getOne.ts": "export const getRecipe = authQuery({});" });

    expect(code).toBe(1);
    expect(output).toContain("is not part of the export grammar");
  });

  it("accepts a verb-suffixed internal export", () => {
    const { code } = runC1({
      "persist.ts": "export const _internal_persist = internalMutation({});",
    });

    expect(code).toBe(0);
  });

  it("rejects an export that is not a builder call at all", () => {
    const { code, output } = runC1({ "getOne.ts": "export const authed = 42;" });

    expect(code).toBe(1);
    expect(output).toContain("is not a procedure builder call");
  });
});

describe("what C1 must leave alone", () => {
  it("ignores an exported type, which carries no access level", () => {
    const { code } = runC1({ "getOne.ts": "export type Args = { id: string };" });

    expect(code).toBe(0);
  });

  it("ignores a non-exported const, which Convex never registers", () => {
    const { code } = runC1({ "getOne.ts": "const handler = authQuery({});" });

    expect(code).toBe(0);
  });

  it("ignores test files, whose exports are not procedures", () => {
    const { code } = runC1({
      "__tests__/getOne.test.ts": "export const admin = authQuery({});",
    });

    expect(code).toBe(0);
  });
});
