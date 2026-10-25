import { describe, expect, it } from "vitest";

import { importCountdownOf, importProgressOf, VIDEO_IMPORT_MINUTES } from "../importCountdown";

const STARTED_AT = 1_760_000_000_000;
const after = (seconds: number) => STARTED_AT + seconds * 1000;

describe("importCountdownOf", () => {
  it("opens on the full announcement, the same minutes the share sheet promises", () => {
    expect(importCountdownOf(STARTED_AT, STARTED_AT)).toEqual({ unit: "minutes", count: VIDEO_IMPORT_MINUTES });
    expect(importCountdownOf(STARTED_AT, after(1))).toEqual({ unit: "minutes", count: VIDEO_IMPORT_MINUTES });
  });

  it("rounds minutes up, so a minute and a half left still reads two", () => {
    expect(importCountdownOf(STARTED_AT, after(90))).toEqual({ unit: "minutes", count: 2 });
  });

  it("switches to seconds for the last minute", () => {
    expect(importCountdownOf(STARTED_AT, after(120))).toEqual({ unit: "minutes", count: 1 });
    expect(importCountdownOf(STARTED_AT, after(121))).toEqual({ unit: "seconds", count: 59 });
    expect(importCountdownOf(STARTED_AT, after(152))).toEqual({ unit: "seconds", count: 28 });
  });

  it("is due once the announced time is up, and stays due however long the import runs over", () => {
    expect(importCountdownOf(STARTED_AT, after(180))).toEqual({ unit: "due" });
    expect(importCountdownOf(STARTED_AT, after(600))).toEqual({ unit: "due" });
  });

  /** A web page added from the chat announces 30 s, and counts them. */
  it("counts down the time the import announced, when it says one", () => {
    expect(importCountdownOf(STARTED_AT, STARTED_AT, 30_000)).toEqual({ unit: "seconds", count: 30 });
    expect(importCountdownOf(STARTED_AT, after(12), 30_000)).toEqual({ unit: "seconds", count: 18 });
    expect(importCountdownOf(STARTED_AT, after(30), 30_000)).toEqual({ unit: "due" });
  });
});

describe("importProgressOf", () => {
  const EXPECTED = 30_000;

  it("starts empty", () => {
    expect(importProgressOf(STARTED_AT, EXPECTED, STARTED_AT)).toBe(0);
  });

  it("fills evenly: half the time is about half the bar", () => {
    expect(importProgressOf(STARTED_AT, EXPECTED, after(15))).toBeCloseTo(0.475);
  });

  /** Full would say the recipe is there; the import answering is what completes the card. */
  it("holds at 95 % from the announced time on, however long the import runs over", () => {
    expect(importProgressOf(STARTED_AT, EXPECTED, after(30))).toBe(0.95);
    expect(importProgressOf(STARTED_AT, EXPECTED, after(120))).toBe(0.95);
  });

  /** A clock read a moment before the import started, as a card's first tick can be. */
  it("never goes below empty", () => {
    expect(importProgressOf(STARTED_AT, EXPECTED, STARTED_AT - 800)).toBe(0);
  });
});
