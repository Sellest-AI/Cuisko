import { describe, expect, it } from "vitest";

import { toggle } from "../helpers";

describe("toggle", () => {
  it("adds an id that is absent and removes one that is present", () => {
    expect(toggle([], "oven")).toEqual(["oven"]);
    expect(toggle(["oven"], "blender")).toEqual(["oven", "blender"]);
    expect(toggle(["oven", "blender"], "oven")).toEqual(["blender"]);
  });

  /** The list is rebuilt rather than spliced, so a caller holding the old one still sees it. */
  it("leaves the list it was given alone", () => {
    const utensils = ["oven"];

    expect(toggle(utensils, "blender")).toEqual(["oven", "blender"]);
    expect(utensils).toEqual(["oven"]);
  });

  /** No ceiling here: that is `toggleTaste`'s job, and the two are used on different questions. */
  it("keeps adding past the taste ceiling", () => {
    expect(toggle(["a", "b", "c", "d"], "e")).toHaveLength(5);
  });
});
