import { describe, expect, it } from "vitest";
import z from "zod/v4";

import { displayTool, toDisplayCard } from "../display";

/**
 * The rule ADR 0010 hangs the carried-id allowance on: a bad id is an error the model reads, never a
 * card quietly one short. Which ids count as bad — malformed, another table's, deleted — is
 * `missingRecipeIds`'s question and is pinned in its own test.
 */
describe("toDisplayCard", () => {
  it("keeps the model's order", () => {
    expect(toDisplayCard({ kind: "recipes", ids: ["c", "a", "b"] }, [])).toEqual({
      v: 1,
      kind: "recipes",
      ids: ["c", "a", "b"],
    });
  });

  it("drops a repeated id, keeping its first position", () => {
    expect(toDisplayCard({ kind: "recipes", ids: ["a", "b", "a"] }, []).ids).toEqual(["a", "b"]);
  });

  it("throws on an unknown id, naming it, instead of showing the others", () => {
    expect(() => toDisplayCard({ kind: "recipes", ids: ["a", "ghost"] }, ["ghost"])).toThrow(/ghost/);
  });
});

/**
 * GLM 5.3 left `kind` out of 29 display calls in one bake-off: a field with one legal value reads as
 * one it need not send. Every call was refused, retried, and cost the cook a round trip. Recipes is
 * the only kind, so a missing one means recipes.
 */
describe("a display call without its kind", () => {
  it("is accepted by the schema", () => {
    expect((displayTool.inputSchema as z.ZodType).safeParse({ ids: ["a"] }).success).toBe(true);
  });

  it("shows recipes", () => {
    expect(toDisplayCard({ ids: ["a"] }, [])).toEqual({ v: 1, kind: "recipes", ids: ["a"] });
  });
});
