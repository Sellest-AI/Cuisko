import { describe, expect, test } from "vitest";

import {
  EMPTY_ENTRY,
  hear,
  readEvent,
  isSilenceOver,
  joinTranscript,
  SILENCE_MS,
  speechLanguage,
  OPEN_RANGE,
  toLevel,
  VOICE_FLOOR,
  type VolumeRange,
  widen,
} from "../voice";

/** "Trois œufs" said at t=1000, then the shopper stops talking. */
const SPOKE_AT = 1_000;

describe("when a spoken entry ends itself", () => {
  test("a loud sample marks the shopper as talking", () => {
    expect(hear(null, VOICE_FLOOR, SPOKE_AT)).toBe(SPOKE_AT);
  });

  test("a quiet sample keeps the last time they were heard", () => {
    expect(hear(SPOKE_AT, VOICE_FLOOR - 0.1, SPOKE_AT + 500)).toBe(SPOKE_AT);
  });

  test("the kitchen humming before anyone speaks never ends the entry", () => {
    const lastVoiceAt = hear(null, 0.5, SPOKE_AT);

    expect(lastVoiceAt).toBeNull();
    expect(isSilenceOver(lastVoiceAt, SPOKE_AT + 60_000)).toBe(false);
  });

  test("a pause shorter than the silence window is still the same sentence", () => {
    expect(isSilenceOver(SPOKE_AT, SPOKE_AT + SILENCE_MS - 1)).toBe(false);
  });

  test("the entry ends once the silence window has passed since they last spoke", () => {
    expect(isSilenceOver(SPOKE_AT, SPOKE_AT + SILENCE_MS)).toBe(true);
  });

  test("speaking again restarts the window", () => {
    const resumedAt = SPOKE_AT + 1_500;
    const lastVoiceAt = hear(SPOKE_AT, VOICE_FLOOR + 3, resumedAt);

    expect(isSilenceOver(lastVoiceAt, SPOKE_AT + SILENCE_MS)).toBe(false);
    expect(isSilenceOver(lastVoiceAt, resumedAt + SILENCE_MS)).toBe(true);
  });
});

describe("the wave's level, drawn against this entry's own range", () => {
  /** The range after a run of volume samples, one per recognizer report. */
  const heardOver = (volumes: number[], from: VolumeRange = OPEN_RANGE) =>
    volumes.reduce(widen, from);

  /** A voice between words and syllables: `times` pairs of a dip and a peak. */
  const speaking = (dip: number, peak: number, times: number) =>
    Array.from({ length: times }, () => [dip, peak]).flat();

  test("silence draws a flat wave", () => {
    expect(toLevel(OPEN_RANGE, 0)).toBe(0);
    expect(toLevel(OPEN_RANGE, -2)).toBe(0);
  });

  test("a quiet voice still reaches the top, and its dips still draw low", () => {
    // Speaking softly: the recognizer never reports past 3.
    const range = heardOver(speaking(0.5, 3, 10));

    expect(toLevel(range, 3)).toBeGreaterThan(0.9);
    expect(toLevel(range, 1.5)).toBeLessThan(0.6);
  });

  test("a loud voice is not squashed against the top — its middle still draws in the middle", () => {
    const range = heardOver(speaking(1, 10, 10));

    expect(toLevel(range, 10)).toBe(1);
    expect(toLevel(range, 6)).toBeGreaterThan(0.4);
    expect(toLevel(range, 6)).toBeLessThan(0.7);
  });

  test("a steady hum is never stretched into a wave", () => {
    const range = heardOver(Array.from({ length: 100 }, () => 0.5));

    expect(toLevel(range, 0.5)).toBe(0);
    expect(toLevel(range, 0.7)).toBeLessThan(0.1);
  });

  test("right after a shout, a quiet voice draws small", () => {
    const range = heardOver([10, ...speaking(0.5, 3, 1)]);

    expect(toLevel(range, 3)).toBeLessThan(0.4);
  });

  test("a few seconds later, the quiet voice draws as if the shout had never happened", () => {
    // 100 reports at the recognizer's pace: five seconds of speaking softly.
    const afterShout = heardOver([10, ...speaking(0.5, 3, 50)]);
    const withoutShout = heardOver(speaking(0.5, 3, 50));

    expect(toLevel(afterShout, 3)).toBeCloseTo(toLevel(withoutShout, 3), 2);
  });

  test("nothing draws past the top", () => {
    expect(toLevel(heardOver(speaking(1, 10, 10)), 14)).toBe(1);
  });
});

describe("the transcript handed to the text field", () => {
  test("settled segments and the one still being heard read as one line", () => {
    expect(joinTranscript(["trois œufs", "et du lait"], "demi-écrémé")).toBe("trois œufs et du lait demi-écrémé");
  });

  test("a segment that settled on nothing leaves no double space", () => {
    expect(joinTranscript(["trois œufs", "  "], "")).toBe("trois œufs");
  });

  test("nothing said is an empty line", () => {
    expect(joinTranscript([], "")).toBe("");
  });
});

describe("what the recognizer's events do to one spoken entry", () => {
  const started = readEvent(EMPTY_ENTRY, { type: "start" }).entry;

  test("a spoken entry hands over its words once the recognizer ends", () => {
    let entry = started;
    entry = readEvent(entry, { type: "result", transcript: "trois œufs", isFinal: true }).entry;
    entry = readEvent(entry, { type: "result", transcript: "et du lait", isFinal: false }).entry;

    expect(readEvent(entry, { type: "end" }).done).toBe("trois œufs et du lait");
  });

  test("an end heard before this entry started belongs to the previous one, and is ignored", () => {
    // The trash aborts the old entry; its `end` lands after the mic has opened a new one.
    const { entry, done } = readEvent(EMPTY_ENTRY, { type: "end" });

    expect(done).toBeNull();
    expect(readEvent(entry, { type: "start" }).done).toBeNull();
  });

  test("the entry still ends normally after ignoring the previous one's end", () => {
    let entry = readEvent(EMPTY_ENTRY, { type: "end" }).entry;
    entry = readEvent(entry, { type: "start" }).entry;
    entry = readEvent(entry, { type: "result", transcript: "du beurre", isFinal: true }).entry;

    expect(readEvent(entry, { type: "end" }).done).toBe("du beurre");
  });

  test("a recognizer that fails before starting ends the entry with nothing", () => {
    // No `end` is promised when it never started, so the bar must not wait for one.
    expect(readEvent(EMPTY_ENTRY, { type: "error", error: "not-allowed" }).done).toBe("");
  });

  test("the previous entry's abort is not a failure of this one", () => {
    expect(readEvent(EMPTY_ENTRY, { type: "error", error: "aborted" }).done).toBeNull();
  });

  test("a failure mid-entry waits for the end that follows it, and keeps what was heard", () => {
    let entry = readEvent(started, { type: "result", transcript: "trois œufs", isFinal: true }).entry;
    const failed = readEvent(entry, { type: "error", error: "network" });
    entry = failed.entry;

    expect(failed.done).toBeNull();
    expect(readEvent(entry, { type: "end" }).done).toBe("trois œufs");
  });

  test("a recognizer that starts with nothing asked of it keeps listening", () => {
    expect(readEvent(EMPTY_ENTRY, { type: "start" }).stop).toBe(false);
  });

  test("send, once listening, stops the recognizer at once", () => {
    expect(readEvent(started, { type: "stop" }).stop).toBe(true);
  });

  test("send before the recognizer started stops it the moment it starts", () => {
    // The first mic press shows a permission prompt, and the shopper taps send behind it.
    const early = readEvent(EMPTY_ENTRY, { type: "stop" });

    expect(early.stop).toBe(false);
    expect(readEvent(early.entry, { type: "start" }).stop).toBe(true);
  });

  test("send pressed twice, or the silence after it, asks for one stop only", () => {
    const { entry } = readEvent(started, { type: "stop" });

    expect(readEvent(entry, { type: "stop" }).stop).toBe(false);
  });

  test("an entry hands over its words only once", () => {
    const { entry } = readEvent(started, { type: "end" });

    expect(readEvent(entry, { type: "end" }).done).toBeNull();
    expect(readEvent(entry, { type: "error", error: "not-allowed" }).done).toBeNull();
  });
});

describe("the recognizer's language", () => {
  test("each app language maps to a full tag", () => {
    expect(speechLanguage("fr")).toBe("fr-FR");
    expect(speechLanguage("en")).toBe("en-US");
  });
});
