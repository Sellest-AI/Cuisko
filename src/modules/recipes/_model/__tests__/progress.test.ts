import { describe, expect, it } from "vitest";

import { DEFAULT_ESTIMATE_MS, phaseAt, sweepFor } from "../progress";

/**
 * An estimated bar is a claim about something nobody measured, so what is pinned here is the one
 * property that makes the claim honest: it never says done. Everything else about the curve is a
 * tuning decision and may move; a run that fills the ring before the recipe exists is a lie.
 */
describe("sweepFor", () => {
  const progressAt = sweepFor(DEFAULT_ESTIMATE_MS);

  it("is empty before the clock starts", () => {
    expect(progressAt(0)).toBe(0);
  });

  it("reads as nothing done when the clock jumps backwards", () => {
    expect(progressAt(-1_000)).toBe(0);
  });

  it("never goes backwards, so the ring cannot appear to undo work", () => {
    const samples = Array.from({ length: 200 }, (_, index) => progressAt(index * 500));

    samples.forEach((value, index) => {
      if (index > 0) expect(value).toBeGreaterThanOrEqual(samples[index - 1]!);
    });
  });

  it("settles on the cap and never claims done, however long the action runs", () => {
    /**
     * Ten minutes is far past any wait a cook would tolerate, and the curve has still only
     * settled onto the cap. The distance from 1 is the property that matters: the last tenth is
     * the action resolving, and nothing the clock does may spend it.
     */
    expect(progressAt(600_000)).toBeLessThanOrEqual(0.9);
    expect(progressAt(600_000)).toBeLessThan(1);
    expect(progressAt(Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(0.9);
    expect(progressAt(Number.MAX_SAFE_INTEGER)).toBeLessThan(1);
  });

  /**
   * The reason this is a function at all: the shape is fixed and the estimate is the input. So the
   * contract is stated against the estimate rather than against fifteen seconds, and a caller that
   * knows its wait is a minute gets the same curve walked at a minute's pace.
   */
  it("reaches the last phase exactly as the estimate expires, at any estimate", () => {
    [1_000, DEFAULT_ESTIMATE_MS, 60_000].forEach((estimate) => {
      expect(sweepFor(estimate)(estimate)).toBeCloseTo(0.75, 5);
    });
  });

  it("walks a longer estimate more slowly, rather than drawing a different curve", () => {
    const brisk = sweepFor(5_000);
    const patient = sweepFor(50_000);

    expect(patient(5_000)).toBeLessThan(brisk(5_000));
    /** Same shape, ten times the clock: the two agree wherever the elapsed time scales with it. */
    expect(patient(50_000)).toBeCloseTo(brisk(5_000), 5);
  });

  it("defaults to the measured estimate when a caller has nothing better to go on", () => {
    expect(sweepFor()(DEFAULT_ESTIMATE_MS)).toBe(sweepFor(DEFAULT_ESTIMATE_MS)(DEFAULT_ESTIMATE_MS));
  });

  it("refuses to invert when handed an estimate that is not a wait", () => {
    /** Zero and below would run the curve backwards through the cap and off the ring. */
    [0, -5_000].forEach((estimate) => {
      const nonsense = sweepFor(estimate);

      expect(nonsense(0)).toBe(0);
      expect(nonsense(1_000)).toBeGreaterThan(0);
      expect(nonsense(1_000)).toBeLessThanOrEqual(0.9);
    });
  });
});

/**
 * The label is read off the progress, not off the clock, so these boundaries are the same numbers
 * the ring is drawn from — which is what stops "Almost there" appearing over a half-empty ring.
 */
describe("phaseAt", () => {
  const progressAt = sweepFor(DEFAULT_ESTIMATE_MS);

  it("opens on reading, which is what the agent is doing first", () => {
    expect(phaseAt(progressAt(0))).toBe("reading");
  });

  it("moves to matching once the sweep passes the first boundary", () => {
    expect(phaseAt(0.39)).toBe("reading");
    expect(phaseAt(0.4)).toBe("matching");
  });

  it("settles on finishing at the estimate and stays there for as long as it takes", () => {
    expect(phaseAt(0.74)).toBe("matching");
    expect(phaseAt(progressAt(DEFAULT_ESTIMATE_MS))).toBe("finishing");
    expect(phaseAt(progressAt(600_000))).toBe("finishing");
  });

  it("puts the boundaries at the same place whatever the estimate is", () => {
    expect(phaseAt(sweepFor(60_000)(60_000))).toBe("finishing");
    expect(phaseAt(sweepFor(1_000)(1_000))).toBe("finishing");
  });
});
