import { describe, expect, test } from "vitest";

import { localStamp } from "../clock";

/** Local constructor on purpose: the stamp is the cook's wall clock, never UTC. */
describe("localStamp", () => {
  test("reads the local date and time, minutes included", () => {
    expect(localStamp(new Date(2026, 8, 24, 19, 5))).toBe("2026-09-24T19:05");
  });

  test("pads single-digit months, days, hours and minutes", () => {
    expect(localStamp(new Date(2026, 0, 3, 7, 4))).toBe("2026-01-03T07:04");
  });

  test("midnight stays on its own day, whatever the machine's offset", () => {
    expect(localStamp(new Date(2026, 8, 24, 0, 0))).toBe("2026-09-24T00:00");
  });
});
