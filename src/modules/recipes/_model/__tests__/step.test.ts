import { describe, expect, it } from "vitest";

import { stepNumber } from "../step";

/**
 * Two screens read the same method and have to agree on what "step 3" means, so what is pinned
 * here is the agreement: the 1-based number a cook reads aloud, at a width that does not shift
 * when the method passes nine steps.
 */
describe("stepNumber", () => {
  it("starts at 01, because nobody starts a method at zero", () => {
    expect(stepNumber(1)).toBe("01");
  });

  it("keeps one width across the boundary that would otherwise shift the layout", () => {
    expect(stepNumber(9)).toHaveLength(2);
    expect(stepNumber(10)).toHaveLength(2);
    expect(stepNumber(10)).toBe("10");
  });

  it("stops padding rather than truncating once the number outgrows the width", () => {
    expect(stepNumber(100)).toBe("100");
  });
});
