import { describe, expect, it } from "vitest";

import { stepTilt, type TiltSample } from "../tilt";

const MAX_SHIFT = 8;

/** The sensor's noise on a phone lying on a table: a few thousandths of gravity, never twice the same. */
const jitter = (index: number) => Math.sin(index * 12.9898) * 0.004;

/** Feeds `rolls` through the step the way `TiltSensor` does, and counts how often it wrote. */
const run = (rolls: number[], start: Pick<TiltSample, "neutral" | "shift"> = { neutral: null, shift: 0 }) => {
  let { neutral, shift } = start;
  let writes = 0;

  for (const roll of rolls) {
    const step = stepTilt({ roll, neutral, shift, maxShift: MAX_SHIFT });
    neutral = step.neutral;
    if (step.shift !== null) {
      shift = step.shift;
      writes += 1;
    }
  }

  return { neutral, shift, writes };
};

/** One sample per frame at 60Hz, as `TiltSensor` asks for. */
const seconds = (count: number, roll: (index: number) => number) =>
  Array.from({ length: Math.round(count * 60) }, (_, index) => roll(index));

describe("stepTilt", () => {
  it("leaves the shift alone on a phone lying still, whatever the sensor's noise", () => {
    const { writes } = run(seconds(10, (index) => 0.1 + jitter(index)));

    expect(writes).toBe(0);
  });

  it("moves the shift toward a real tilt", () => {
    const step = stepTilt({ roll: 0.125, neutral: 0, shift: 0, maxShift: MAX_SHIFT });

    expect(step.shift).toBeGreaterThan(0);
  });

  it("never pushes the shift past maxShift, however far the phone rolls", () => {
    const { shift } = run(seconds(1, () => 1), { neutral: 0, shift: 0 });

    expect(shift).toBeLessThanOrEqual(MAX_SHIFT);
    expect(shift).toBeGreaterThan(MAX_SHIFT * 0.9);
  });

  it("stops writing once a held tilt has drifted back to rest", () => {
    const tilted = run(seconds(1, () => 0.25), { neutral: 0, shift: 0 });
    const resting = run(seconds(20, (index) => 0.25 + jitter(index)), tilted);
    const after = run(seconds(5, (index) => 0.25 + jitter(index)), resting);

    expect(Math.abs(resting.shift)).toBeLessThan(1);
    expect(after.writes).toBe(0);
  });
});
