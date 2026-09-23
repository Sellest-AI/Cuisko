/**
 * Which words of a step a cook should be able to find at a glance: how much, and for how long.
 * "Ajoutez **200 g** de farine et laissez cuire **10 minutes**."
 *
 * A cook reads a step in two passes, the second with their hands full: once to understand it, then
 * again to pull a number back out of it mid-gesture. The second pass is the one this serves, and it
 * is why only quantities and durations are marked — every other word of the step, the ingredient's
 * name included, is read once.
 *
 * Amounts come from `readInstruction`, not from a pattern written here: it already decides which
 * numbers count food, and a second opinion would bold a "180" the scaler had rightly left alone.
 * Durations are the one thing it deliberately refuses to read, so they are matched here.
 *
 * It also says where each ingredient's picture goes: just before the amount tied to it,
 * "🍅 4 tomates", so the picture leads the eye into the quantity it is labelling.
 *
 * Framework-free, like the rest of `_model/`: the instructions tab and the cooking session draw the
 * same step, and they have to agree on what stands out in it.
 */

import type { RecipeLine } from "./detail";
import { readInstruction } from "./quantities";

/**
 * One slice of an instruction, or the place an ingredient's picture is drawn.
 *
 * Joining the `text` of every text segment reproduces the instruction exactly, so drawing the
 * segments can never change what the step says, only how it looks. An `ingredient` segment adds no
 * text: it marks a point between two characters, not a slice of them.
 */
export type EmphasisSegment =
  | { kind: "text"; text: string; strong: boolean }
  | { kind: "ingredient"; line: RecipeLine };

/** A number as a cook writes one, digits or glyph. */
const _NUMERAL = String.raw`\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+|[½⅓⅔¼¾]`;

/**
 * The counts a duration is spelled with in words. French and English, the two locales the app
 * writes recipes in; "a"/"an" is the English article that counts one ("an hour").
 */
const _WORD = [
  "une?", "an?", "one", "deux", "two", "trois", "three", "quatre", "four", "cinq", "five",
  "dix", "ten", "quinze", "fifteen", "vingt", "twenty", "trente", "thirty", "quarante", "forty",
  "quelques", "plusieurs", "a few", "few", "several",
].join("|");

/** Longest spelling first: alternation is first-match, and "h" would otherwise end "heures" early. */
const _UNIT = [
  "minutes?", "mins?", "mn", "heures?", "hours?", "hrs?", "h", "secondes?", "seconds?", "secs?",
  "s", "jours?", "days?", "nuits?", "nights?", "semaines?", "weeks?",
].join("|");

const _COUNT = `(?:${_NUMERAL}|${_WORD})`;

/** "10 à 15", "10-15", "2 or 3": a range reads as one duration, not a number beside another. */
const _RANGE = String.raw`${_COUNT}(?:\s*(?:-|–|à|to|ou|or)\s*${_COUNT})?`;

/**
 * Every way a step states how long something takes.
 *
 * Three shapes, the compound one first so it wins: "1 h 30" and "1h30" (hours then minutes, two
 * digits, the only form a trailing bare number is read as minutes — anywhere else "5 minutes 2
 * fois" would take the 2); the half hours, which have no numeral at all; and a count or range
 * before a unit. Fenced by letters and digits on both sides, so "2 s" is a duration and "2 sucres"
 * is not, and "une" inside "prune" never starts one.
 */
const DURATION = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:` +
    String.raw`\d+\s*(?:h|heures?)\s*\d{2}(?:\s*(?:minutes?|mins?|mn))?` +
    String.raw`|(?:une\s+)?demi[- ]heure|half\s+an\s+hour` +
    String.raw`|${_RANGE}\s*(?:${_UNIT})(?:\s+(?:et\s+demie?|and\s+a\s+half))?` +
    String.raw`)(?![\p{L}\p{N}])`,
  "giu",
);

type Range = { start: number; end: number };

/** Ranges sorted and fused, so an amount touching a duration draws as one bold run, not two. */
const _merge = (ranges: Range[]): Range[] => {
  const merged: Range[] = [];

  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }

  return merged;
};

/**
 * The instruction cut into plain and emphasised slices, with a picture before each amount tied to
 * one of the recipe's ingredients.
 *
 * `lines` are the recipe's own ingredient lines, the same ones `readInstruction` scales against, so
 * a quantity is bolded exactly when the servings stepper would move it — plus the measured amounts
 * it scales without naming ("2 cs de jus de citron" bolds "2 cs").
 */
export const emphasizeInstruction = (instruction: string, lines: RecipeLine[]): EmphasisSegment[] => {
  const ranges: Range[] = [];
  const pictures: { at: number; line: RecipeLine }[] = [];

  let offset = 0;
  for (const segment of readInstruction(instruction, lines)) {
    if (segment.amount !== undefined) {
      ranges.push({ start: offset, end: offset + segment.text.length + (segment.reach ?? 0) });
      if (segment.line) pictures.push({ at: offset, line: segment.line });
    }
    offset += segment.text.length;
  }

  for (const match of instruction.matchAll(DURATION)) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

  /**
   * Every point the text changes: a bold run starting or ending, or a picture going in. Cutting at
   * all of them in one pass means a picture that lands inside a bold run splits it rather than
   * being pushed to its edge.
   */
  const merged = _merge(ranges);
  const cuts = [
    ...new Set([
      0,
      instruction.length,
      ...merged.flatMap((range) => [range.start, range.end]),
      ...pictures.map((picture) => picture.at),
    ]),
  ].sort((a, b) => a - b);

  const segments: EmphasisSegment[] = [];

  cuts.forEach((cut, index) => {
    for (const picture of pictures) {
      if (picture.at === cut) segments.push({ kind: "ingredient", line: picture.line });
    }

    const next = cuts[index + 1];
    if (next === undefined || next === cut) return;

    const strong = merged.some((range) => range.start <= cut && next <= range.end);
    const last = segments.at(-1);
    const text = instruction.slice(cut, next);

    /** Adjacent cuts of the same weight are one run, so a step draws as few spans as it can. */
    if (last?.kind === "text" && last.strong === strong) last.text += text;
    else segments.push({ kind: "text", text, strong });
  });

  return segments;
};
