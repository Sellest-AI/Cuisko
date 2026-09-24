import { describe, expect, test } from "vitest";

import { displayLayout } from "../displayLayout";

describe("displayLayout", () => {
  /** One recommendation is a card, not a shelf with nothing on it. */
  test("one recipe is drawn on its own", () => {
    expect(displayLayout({ kind: "recipes", v: 1, ids: ["r1"] })).toBe("single");
  });

  test("several recipes are a shelf", () => {
    expect(displayLayout({ kind: "recipes", v: 1, ids: ["r1", "r2"] })).toBe("shelf");
    expect(displayLayout({ kind: "recipes", v: 1, ids: ["r1", "r2", "r3", "r4", "r5", "r6"] })).toBe("shelf");
  });
});
