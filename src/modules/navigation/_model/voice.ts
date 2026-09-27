import type { Locale } from "@shared/translations";

/**
 * The rules a spoken entry into the bar follows, apart from the recognizer that hears it.
 *
 * The recognizer reports volume on its own scale — a float from -2 to 10, where anything below 0 is
 * inaudible — and a transcript in pieces. Everything the bar decides from those two streams is here,
 * so it can be pinned without a microphone.
 */

/**
 * How loud a sample must be to count as the shopper talking rather than the kitchen humming.
 *
 * Low on purpose: at 2, and still at 1, a quietly spoken sentence read as silence and the entry
 * stopped mid-way. Not 0 either — at 0 a room's hum counts as talking, which can keep the entry
 * from ever ending itself, or arm the silence timer before anyone has said a word.
 */
export const VOICE_FLOOR = 0.6;

/** How long the shopper must stay quiet, after having said something, for the entry to end itself. */
export const SILENCE_MS = 8000;


/**
 * When the shopper was last heard talking, after one more volume sample.
 *
 * `null` until the first loud sample: silence before anyone has spoken is someone gathering their
 * thoughts, not an entry that is over.
 */
export const hear = (lastVoiceAt: number | null, volume: number, now: number): number | null =>
  volume >= VOICE_FLOOR ? now : lastVoiceAt;

/** Whether the entry has gone quiet for long enough to end itself. Never before anything was said. */
export const isSilenceOver = (lastVoiceAt: number | null, now: number): boolean =>
  lastVoiceAt !== null && now - lastVoiceAt >= SILENCE_MS;

/**
 * The quietest and loudest this entry has heard lately, on the recognizer's scale — what the wave
 * is drawn against.
 *
 * **Why a range of its own rather than a fixed scale.** A fixed scale has to pick one voice to
 * suit: a soft voice never climbing past 3 never reached the top of it, and any curve that lifted
 * it squashed a loud voice into a flat band under the cap. Drawn against the range the shopper is
 * actually using, a soft voice fills the wave and a loud one keeps its ups and downs.
 */
export type VolumeRange = { low: number, high: number };

/**
 * The narrowest the range may get, in points of the recognizer's scale. Without it, a steady hum
 * wobbling between 0.4 and 0.6 would be stretched to the full height of the wave.
 */
const MIN_SPAN = 3;

/**
 * How far the loudest sinks per report (one every 50 ms — two points a second) when nothing as
 * loud comes in. A shout sets it at once; this is what gives a softer voice after it its height
 * back within a few seconds.
 */
const HIGH_DECAY = 0.1;

/**
 * How far the quietest creeps up per report while nothing as quiet comes in. Slow on purpose: the
 * low is meant to sit on the pauses between words, not on the words, and every pause drops it back.
 */
const LOW_RISE = 0.01;

/** Before anything is heard: from silence to the narrowest span. */
export const OPEN_RANGE: VolumeRange = { low: 0, high: MIN_SPAN };

/**
 * The range after one more volume sample. Each end moves at once towards a sample past it — a
 * louder peak, a quieter pause — and drifts slowly back otherwise.
 */
export const widen = (range: VolumeRange, volume: number): VolumeRange => {
  const heard = Math.max(volume, 0);
  const low = Math.min(heard, range.low + LOW_RISE);
  const high = Math.max(heard, range.high - HIGH_DECAY, low + MIN_SPAN);

  return { low, high };
};

/** A volume sample as the wave draws it: 0 at the range's quietest, 1 at its loudest. */
export const toLevel = (range: VolumeRange, volume: number): number => {
  const share = (Math.max(volume, 0) - range.low) / (range.high - range.low);

  return Math.min(Math.max(share, 0), 1);
};

/**
 * The words heard so far, as one line for the text field.
 *
 * A continuous session arrives as settled segments plus the one still being heard. Blank pieces
 * are dropped so a segment that settled on nothing does not leave a double space behind.
 */
export const joinTranscript = (settled: readonly string[], pending: string): string =>
  [...settled, pending].map((piece) => piece.trim()).filter(Boolean).join(" ");

/** One spoken entry, as far as the recognizer's events have taken it. */
export type Entry = {
  settled: readonly string[];
  pending: string;
  /** This entry's own `start` has arrived. Nothing that ends an entry counts before it. */
  hasStarted: boolean;
  /** Send was pressed, or the silence window closed. Kept until `start` if it came before it. */
  isStopAsked: boolean;
  /** Its words were handed over, or it ended with none. Nothing after this counts. */
  isOver: boolean;
};

export const EMPTY_ENTRY: Entry = {
  settled: [],
  pending: "",
  hasStarted: false,
  isStopAsked: false,
  isOver: false,
};

/**
 * What moves an entry along: the recognizer's own events, and `stop` — send, or the silence window
 * closing. Volume is not one of them; it is `hear`'s.
 */
export type RecognizerEvent =
  | { type: "start" }
  | { type: "result", transcript: string, isFinal: boolean }
  | { type: "end" }
  | { type: "error", error: string }
  | { type: "stop" };

/** What one event did: the entry after it, and what the hook must now do about it. */
type Reading = {
  entry: Entry,
  /** The line to hand to the text field when this event ended the entry, `null` while it goes on. */
  done: string | null,
  /** Tell the recognizer to stop now. True once per entry, at the first moment a stop can land. */
  stop: boolean,
};

const _reading = (entry: Entry, done: string | null = null, stop = false): Reading =>
  ({ entry, done, stop });

/**
 * One event applied to an entry.
 *
 * **Nothing ends an entry before its own `start`.** There is one recognizer and it outlives the
 * voice bar: aborting an entry — the trash, a tap outside — reports `end` a moment later, and if
 * the mic was pressed again meanwhile, that `end` arrives while the new entry is waiting on its
 * permission prompt. Counted, it would close the new voice bar the instant it opened.
 *
 * **Except a failure to start at all.** An error before `start` is this entry's recognizer
 * refusing to begin, and no `end` is promised after it, so it ends the entry with nothing rather
 * than leaving the bar listening to silence. `aborted` is the one error that is never this entry's:
 * it is how the previous one reports being thrown away. After `start`, an error waits for the `end`
 * that follows it, so whatever was heard before it still reaches the field.
 *
 * **A stop asked before `start` waits for it.** Send can be pressed behind the first permission
 * prompt, before anything is listening; stopping then does nothing, and the recognizer would start
 * a moment later and listen with the stop already spent. So the stop is kept, and fires on
 * `start`. It fires once: a second send, or the silence window closing after send, asks nothing.
 *
 * Results settle as the platform settles them: Android settles each phrase and starts the next
 * blank, iOS keeps one growing phrase and settles it at the end. Both arrive at the same line.
 */
export const readEvent = (entry: Entry, event: RecognizerEvent): Reading => {
  if (entry.isOver) return _reading(entry);

  switch (event.type) {
    case "start":
      return _reading({ ...entry, hasStarted: true }, null, entry.isStopAsked);

    case "stop":
      if (entry.isStopAsked) return _reading(entry);
      return _reading({ ...entry, isStopAsked: true }, null, entry.hasStarted);

    case "result":
      if (!entry.hasStarted) return _reading(entry);
      return _reading(event.isFinal
        ? { ...entry, settled: [...entry.settled, event.transcript], pending: "" }
        : { ...entry, pending: event.transcript });

    case "end":
      if (!entry.hasStarted) return _reading(entry);
      return _reading({ ...entry, isOver: true }, joinTranscript(entry.settled, entry.pending));

    case "error":
      if (entry.hasStarted || event.error === "aborted") return _reading(entry);
      return _reading({ ...entry, isOver: true }, "");
  }
};

/** The recognizer takes a full language tag, where the app only knows the language. */
const SPEECH_LANGUAGE: Record<Locale, string> = {
  en: "en-US",
  fr: "fr-FR",
};

export const speechLanguage = (locale: Locale): string => SPEECH_LANGUAGE[locale];
