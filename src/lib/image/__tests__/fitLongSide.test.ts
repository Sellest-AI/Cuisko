import { describe, expect, test } from "vitest";

import { fitLongSide } from "../fitLongSide";

describe("fitLongSide", () => {
  test("a 4000x3000 camera photo is brought to 1024 wide", () => {
    expect(fitLongSide(4000, 3000)).toEqual({ width: 1024 });
  });

  test("a portrait 3000x4000 photo is brought to 1024 tall", () => {
    expect(fitLongSide(3000, 4000)).toEqual({ height: 1024 });
  });

  test("a photo already within 1024 is left alone, never enlarged", () => {
    expect(fitLongSide(800, 600)).toBeUndefined();
    expect(fitLongSide(1024, 1024)).toBeUndefined();
  });
});
