import { describe, expect, test } from "vitest";

import { COST_RATES, estimateCostUsd } from "../costRates";

describe("estimateCostUsd", () => {
  test("a model billed per image costs its rate, however long the render ran", () => {
    expect(estimateCostUsd({ model: "prunaai/p-image-ideogram", seconds: 4.2 })).toBe(
      COST_RATES["prunaai/p-image-ideogram"].perRunUsd,
    );
    expect(estimateCostUsd({ model: "prunaai/p-image-ideogram" })).toBe(COST_RATES["prunaai/p-image-ideogram"].perRunUsd);
  });

  test("a model billed by the second costs its run time at the rate", () => {
    // A cut-out that ran 3 s.
    expect(estimateCostUsd({ model: "runpod/removeBackground", seconds: 3 })).toBeCloseTo(
      3 * COST_RATES["runpod/removeBackground"].perSecondUsd,
      10,
    );
  });

  test("a run time nobody reported is no cost at all, never 0", () => {
    expect(estimateCostUsd({ model: "runpod/removeBackground" })).toBeNull();
  });
});
