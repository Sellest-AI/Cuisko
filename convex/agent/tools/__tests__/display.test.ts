import { describe, expect, it } from "vitest";

import { toDisplayCard } from "../display";

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
