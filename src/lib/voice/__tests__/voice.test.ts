import { describe, expect, test } from "vitest";

import {
  EMPTY_ENTRY,
  hearWords,
  readEvent,
  isSilenceOver,
  isSpokenSentence,
  joinTranscript,
  SILENCE_MS,
  speechLanguage,
  OPEN_RANGE,
  toLevel,
  type VolumeRange,
  widen,
} from "../voice";

/** "Trois œufs" said at t=1000, then the shopper stops talking. */
const SPOKE_AT = 1_000;

describe("when a spoken entry ends itself", () => {
  test("a new word marks the shopper as talking", () => {
    expect(hearWords(null, "", "trois", SPOKE_AT)).toBe(SPOKE_AT);
  });

  test("the kitchen humming before anyone speaks never ends the entry", () => {
    // No word yet, however loud the room: the window is not armed.
    expect(isSilenceOver(null, SPOKE_AT + 60_000)).toBe(false);
  });

  test("a pause shorter than the silence window is still the same sentence", () => {
    expect(isSilenceOver(SPOKE_AT, SPOKE_AT + SILENCE_MS - 1)).toBe(false);
  });

  test("the entry ends once the silence window has passed since their last word", () => {
    expect(isSilenceOver(SPOKE_AT, SPOKE_AT + SILENCE_MS)).toBe(true);
  });

  test("a new word restarts the window, however softly it was said", () => {
    const resumedAt = SPOKE_AT + 3_000;
    const lastWordAt = hearWords(SPOKE_AT, "trois", "trois œufs", resumedAt);

    expect(isSilenceOver(lastWordAt, SPOKE_AT + SILENCE_MS)).toBe(false);
    expect(isSilenceOver(lastWordAt, resumedAt + SILENCE_MS)).toBe(true);
  });

  test("the recognizer repeating the phrase it already holds is not the shopper speaking", () => {
    const lastWordAt = hearWords(SPOKE_AT, "trois œufs", "trois œufs", SPOKE_AT + 4_000);

    expect(lastWordAt).toBe(SPOKE_AT);
  });

  test("a blank transcript is not a word", () => {
    expect(hearWords(null, "", "  ", SPOKE_AT)).toBeNull();
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

  test("an entry the shopper ended, by send or by going quiet, hands over its words as done", () => {
    let entry = readEvent(started, { type: "result", transcript: "trois œufs", isFinal: false }).entry;
    entry = readEvent(entry, { type: "stop" }).entry;
    const ended = readEvent(entry, { type: "end" });

    expect(ended.done).toBe("trois œufs");
    expect(ended.entry.isStopAsked).toBe(true);
  });

  test("an entry the recognizer ended on its own is not one the shopper finished", () => {
    // A network failure mid-sentence: what was heard is kept, but only to be read back.
    let entry = readEvent(started, { type: "result", transcript: "trois œufs", isFinal: true }).entry;
    entry = readEvent(entry, { type: "error", error: "network" }).entry;

    expect(readEvent(entry, { type: "end" }).entry.isStopAsked).toBe(false);
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

describe("when a spoken entry is a sentence to send rather than a word to confirm", () => {
  test("seven words is a sentence, however it is punctuated", () => {
    expect(isSpokenSentence("qu'est-ce que je peux cuisiner avec mes restes")).toBe(true);
    expect(isSpokenSentence("what can I cook with the leftovers")).toBe(true);
  });

  test("six words is still a grocery or a dish name", () => {
    expect(isSpokenSentence("farine de blé complète bio italienne")).toBe(false);
  });

  test("a question mark makes a sentence of any length", () => {
    expect(isSpokenSentence("des idées ?")).toBe(true);
  });

  test("a full stop or a comma with text after it is a second clause", () => {
    expect(isSpokenSentence("Salut. Ajoute des œufs")).toBe(true);
    expect(isSpokenSentence("Bonjour, des idées")).toBe(true);
  });

  test("a full stop or a comma with nothing after it is not", () => {
    expect(isSpokenSentence("Deux œufs.")).toBe(false);
    expect(isSpokenSentence("Deux œufs,")).toBe(false);
    expect(isSpokenSentence("Ajoute des œufs au menu.")).toBe(false);
  });

  test("a decimal point inside is not punctuation", () => {
    expect(isSpokenSentence("1.5 kg de farine")).toBe(false);
  });

  test("nothing heard is not a sentence", () => {
    expect(isSpokenSentence("  ")).toBe(false);
  });
});
