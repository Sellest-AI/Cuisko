import type { Locale } from "@shared/translations";

/**
 * The rules a spoken entry into the bar follows, apart from the recognizer that hears it.
 *
 * The recognizer reports volume on its own scale — a float from -2 to 10, where anything below 0 is
 * inaudible — and a transcript in pieces. The transcript decides when the entry ends; the volume
 * only draws the wave. Everything the bar decides from those two streams is here, so it can be
 * pinned without a microphone.
 */

/**
 * How long the shopper must go without a new word, after their first, for the entry to end itself.
 *
 * Counted on words and not on volume: at any floor low enough for a soft voice, a fridge or a hood
 * counted as talking and the entry never ended. A hesitation the recognizer does not write down
 * ("euh…") counts as quiet, which is what the length of the window is for.
 */
export const SILENCE_MS = 3000;

/**
 * When the recognizer last turned something into words, after one more transcript.
 *
 * `null` until the first word: quiet, or a noisy room, before anyone has spoken is someone
 * gathering their thoughts, not an entry that is over. Only a transcript that changed counts: iOS
 * re-sends the phrase it already holds while nothing is said, and counting those would keep a
 * finished entry open.
 */
export const hearWords = (lastWordAt: number | null, before: string, after: string, now: number): number | null =>
  after.trim() !== "" && after !== before ? now : lastWordAt;

/** Whether the entry has gone quiet for long enough to end itself. Never before the first word. */
export const isSilenceOver = (lastWordAt: number | null, now: number): boolean =>
  lastWordAt !== null && now - lastWordAt >= SILENCE_MS;

/**
 * At least this many spoken words and the shopper is making a sentence, not naming a grocery. Counted
 * on every word, stopwords included, unlike `readIntent`'s written rule: nobody says seven words
 * to add an item, and a recognizer never hands over the quantity and unit as separate tokens to
 * discount.
 */
const SENTENCE_MIN_SPOKEN_WORDS = 7;

/**
 * A `.` or `,` with a word after it: the recognizer closed one clause and began another. Needs the
 * space, so "1.5 kg" is a number; and needs the word, so the full stop a recognizer puts on the end
 * of "Deux œufs." is not a sentence.
 */
const CLAUSE_BREAK_RE = /[.,]\s+\S/;

/**
 * Whether what was heard is a sentence to send, rather than a word to confirm in the text bar.
 *
 * Off the assistant, a spoken entry lands in the text bar so a misheard grocery is read before it
 * reaches the list. A sentence is the exception: it can only be a question or a request, there is
 * no list item to misplace, and making the shopper tap send on what they just said out loud is
 * the friction the microphone is there to remove.
 *
 * Three signs, any one enough: more than six words; a question mark, which means only one thing;
 * or a `.` / `,` followed by more text.
 */
export const isSpokenSentence = (text: string): boolean => {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean).length;

  return words >= SENTENCE_MIN_SPOKEN_WORDS || trimmed.includes("?") || CLAUSE_BREAK_RE.test(trimmed);
};

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
  /**
   * Send was pressed, or the silence window closed — the shopper is done, and what was heard goes
   * out. Kept until `start` if it came before it. An entry the recognizer ended on its own never
   * has it, and its words are only typed in to be read back.
   */
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
