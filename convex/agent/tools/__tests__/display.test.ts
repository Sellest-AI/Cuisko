import { describe, expect, it } from "vitest";

import { hasDisplayed, toDisplayCard } from "../display";

type Steps = Parameters<typeof hasDisplayed>[0]["steps"];

/** Steps as the SDK hands them to a stop condition, narrowed to the one field it reads. */
const _steps = (...toolResults: string[][]) =>
  toolResults.map((names) => ({ toolResults: names.map((toolName) => ({ toolName })) })) as unknown as Steps;

/**
 * The stop condition ADR 0010's retry depends on. A failed display is a `tool-error` part, never a
 * tool result, so these steps model it as a step with no display result.
 */
describe("hasDisplayed", () => {
  it("stops once the last step showed something", () => {
    expect(hasDisplayed({ steps: _steps(["searchRecipes"], ["display"]) })).toBe(true);
  });

  /** The bug it replaced: `hasToolCall` stopped here, and the model never saw its error. */
  it("keeps going after a display that failed, so the model can retry", () => {
    expect(hasDisplayed({ steps: _steps(["searchRecipes"], []) })).toBe(false);
  });

  it("keeps going while the turn is still searching", () => {
    expect(hasDisplayed({ steps: _steps(["searchRecipes"]) })).toBe(false);
  });

  /** Only the LAST step counts: an earlier display followed by more work is not the end. */
  it("reads the last step only", () => {
    expect(hasDisplayed({ steps: _steps(["display"], ["searchRecipes"]) })).toBe(false);
  });
});

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
