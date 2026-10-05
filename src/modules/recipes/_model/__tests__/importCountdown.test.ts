import { describe, expect, it } from "vitest";

import { importCountdownOf, VIDEO_IMPORT_MINUTES } from "../importCountdown";

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
});
