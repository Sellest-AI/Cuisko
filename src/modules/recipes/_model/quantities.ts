/**
 * The amounts a cook wrote *inside* the method — "Concassez 4 tomates", "ajoutez 200 g de farine"
 * — found, tied to the recipe line they count, and rewritten when the servings stepper moves.
 *
 * Why this has to exist: `scaleTo` already halves the ingredients tab, but the method is a string
 * and nothing was touching it. A recipe for four, cooked for two, listed 250 g of flour on one tab
 * and told the cook to add 500 g on the next. Two numbers for one thing, and the wrong one is the
 * one they are reading while their hands are busy.
 *
 * **A number is scaled only once something says it is an amount of food**, and two things can:
 * the words after it name one of this recipe's own ingredient lines, or they are a measure
 * ("200 g", "2 cs", "1 pincée"). Either is sufficient, and they answer different questions — the
 * match says *which* ingredient a number counts, the measure says *that* it counts food at all.
 * Requiring both was the first version of this file and it was too strict: "2 cs de jus de citron"
 * went unscaled in a recipe whose line is spelled `Citron`, because a matcher tuned to link a line
 * to a catalog row will not call those the same thing — correctly.
 *
 * That is also what keeps `180 °C` and `10 minutes` still. An oven is not an ingredient and no
 * measure of food is spelled `minutes`, so neither signal can fire; `cm` and `mm` are vetoed
 * outright, so a tin measured across is not an amount either. The veto lists are the belt to that
 * braces — they stop a number before either signal is consulted — but the signals are the reason
 * the feature is safe, not the lists. Anything this file cannot identify it leaves exactly as
 * written, which is always the correct fallback: an unscaled number is a recipe as its author
 * typed it.
 *
 * Framework-free and structural, like the rest of `_model/`: the instructions tab and the cooking
 * session read the same method, and they have to agree about what "4 tomatoes" becomes for six.
 */

import { CONFIDENT, scoreCandidate } from "@shared/ingredientMatch";
import type { Unit } from "@shared/ingredients";
import type { InstructionGroup } from "@shared/recipes";
import { foldAccents } from "@shared/translations";

import type { RecipeLine } from "./detail";

/**
 * One slice of an instruction, in the order it was written.
 *
 * `text` is the literal source, so joining every segment's `text` reproduces the instruction
 * character for character — the invariant its test pins, and the thing that makes an unrecognised
 * number a no-op rather than a rewrite. `amount` is set only on a slice that is a number counting
 * an ingredient of this recipe; everything else, including every number this file declined to
 * identify, arrives as plain text.
 */
export type InstructionSegment = {
  text: string;
  /** The number as written, already read out of fractions and comma decimals. */
  amount?: number;
  /**
   * The recipe line it counts, when the words after it named one.
   *
   * Absent on an amount recognised by its measure alone — "2 cs de jus de citron" in a recipe
   * whose line is spelled `Citron`. The number is no less real for it and scales the same; there
   * is simply nothing to attribute it to, so nothing draws a tile for it.
   */
  line?: RecipeLine;
  /** The unit spelled after the number, when it is one the app stores. Absent for a bare count. */
  unit?: Unit;
};

/** What a step calls for, read out of its own text rather than out of a per-step table. */
export type IngredientMention = {
  line: RecipeLine;
  amount: number;
  /**
   * "4 tomates" states no unit, and the line's own unit is the wrong thing to borrow — the recipe
   * may store tomatoes in grams, and "4 g" is a worse answer than no answer. A bare count is a
   * count of things, so it falls back to pieces.
   */
  unit: Unit;
};

/**
 * Fractions as a cook writes them. `1/2` is handled by the pattern below; these are the glyphs a
 * paste from a web page carries, which no arithmetic would otherwise recover.
 */
const VULGAR_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅕": 0.2,
  "⅛": 0.125,
};

/**
 * A quantity as it appears in prose. Ordered longest-form first, because alternation is first-match
 * and `\d+` would otherwise swallow the numerator of `1/2` and leave `/2` behind as text.
 */
const NUMBER = /\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|[½⅓⅔¼¾⅕⅛]/g;

/**
 * Words that, standing immediately after a number, mean it is not a quantity of food.
 *
 * Redundant with the ingredient match in every case we can think of — "minutes" matches no
 * ingredient — and kept anyway, because the cost of the two failures is not symmetric. A number
 * left unscaled is the recipe as written; a duration silently doubled is a burnt dish and a cook
 * who no longer trusts the page. This list is the cheap side of that trade.
 */
const NOT_AN_AMOUNT = new Set([
  // how long
  "minute", "minutes", "min", "mins", "mn", "heure", "heures", "h", "hr", "hrs", "hour", "hours",
  "seconde", "secondes", "sec", "s", "second", "seconds", "jour", "jours", "day", "days",
  "nuit", "night", "semaine", "semaines", "week", "weeks",
  // how hot
  "degre", "degres", "degree", "degrees", "c", "f", "celsius", "fahrenheit", "th", "thermostat",
  // a count of something that is not food
  "fois", "times", "personne", "personnes", "person", "people", "part", "parts",
  "portion", "portions", "cm", "mm", "pouce", "pouces", "inch", "inches",
  // an ordinal — "la 2e fournée", "the 3rd batch"
  "e", "eme", "ere", "er", "re", "st", "nd", "rd",
]);

/** Words that, standing immediately *before* a number, make it a label rather than a quantity. */
const NOT_COUNTED_BY = new Set(["etape", "step", "thermostat", "th", "niveau", "level", "position"]);

/**
 * Things a recipe is cooked *in*. A number that states one of their sizes measures the pan, not
 * the food, and doubling a recipe does not buy the cook a bigger casserole.
 *
 * Only ever consulted through "<container> **de** N" — the shape French states a capacity in. A
 * bare container word before a number is the opposite case ("versez dans le bol 200 g de farine"),
 * and vetoing on that would drop a real quantity for having been poured somewhere.
 */
const CONTAINERS = new Set([
  "casserole", "poele", "faitout", "cocotte", "marmite", "moule", "plat", "saladier", "bol",
  "sauteuse", "ramequin", "pan", "pot", "dish", "bowl", "mold", "mould", "tray",
]);

/**
 * The measures a number can be stated in, and the unit each one means.
 *
 * **A number followed by one of these is a quantity of food, whether or not the words after it
 * name anything.** That is the second of the two ways an amount is recognised, and it is the one
 * that catches "2 cs de jus de citron" in a recipe whose line is spelled `Citron`: the matcher
 * decides *which* ingredient a number counts, not *whether* it counts one. Nothing here can be
 * confused with a duration or a temperature — those are vetoed above, and `cm`/`mm` are among
 * them, so a tin measured across is not a quantity.
 *
 * `undefined` marks a measure the app does not store: a cook writing "2 tranches de pain" is
 * counting bread, and there is no `slice` in `UNITS`. It still proves the number is an amount.
 */
const MEASURES = new Map<string, Unit | undefined>([
  ["g", "g"], ["gr", "g"], ["gramme", "g"], ["grammes", "g"], ["gram", "g"], ["grams", "g"],
  ["mg", "mg"], ["milligramme", "mg"], ["milligrammes", "mg"],
  ["kg", "kg"], ["kilo", "kg"], ["kilos", "kg"], ["kilogramme", "kg"], ["kilogrammes", "kg"],
  ["ml", "ml"], ["millilitre", "ml"], ["millilitres", "ml"],
  ["cl", "cl"], ["centilitre", "cl"], ["centilitres", "cl"],
  ["l", "l"], ["litre", "l"], ["litres", "l"], ["liter", "l"], ["liters", "l"],
  ["oz", "oz"], ["ounce", "oz"], ["ounces", "oz"],
  ["lb", "lb"], ["lbs", "lb"], ["pound", "lb"], ["pounds", "lb"],
  ["cs", "tbsp"], ["tbsp", "tbsp"], ["tablespoon", "tbsp"], ["tablespoons", "tbsp"],
  ["cc", "tsp"], ["tsp", "tsp"], ["teaspoon", "tsp"], ["teaspoons", "tsp"],
  // measures with no stored unit behind them
  ["cuillere", undefined], ["cuilleres", undefined], ["soupe", undefined], ["cafe", undefined],
  ["pincee", undefined], ["pincees", undefined], ["pinch", undefined], ["pinches", undefined],
  ["gousse", undefined], ["gousses", undefined], ["clove", undefined], ["cloves", undefined],
  ["tranche", undefined], ["tranches", undefined], ["slice", undefined], ["slices", undefined],
  ["brin", undefined], ["brins", undefined], ["sprig", undefined], ["sprigs", undefined],
  ["branche", undefined], ["branches", undefined],
  ["feuille", undefined], ["feuilles", undefined], ["leaf", undefined], ["leaves", undefined],
  ["morceau", undefined], ["morceaux", undefined], ["piece", undefined], ["pieces", undefined],
  ["poignee", undefined], ["poignees", undefined], ["handful", undefined],
  ["bocal", undefined], ["boite", undefined], ["boites", undefined],
  ["can", undefined], ["cans", undefined], ["tin", undefined], ["jar", undefined],
  ["sachet", undefined], ["sachets", undefined], ["packet", undefined], ["bag", undefined],
  ["botte", undefined], ["bottes", undefined], ["bunch", undefined],
  ["tasse", undefined], ["tasses", undefined], ["cup", undefined], ["cups", undefined],
  ["verre", undefined], ["verres", undefined],
]);

/**
 * The words that hold a measure to what it measures — "cuillère **à** soupe **d'**huile".
 *
 * Stripped alongside the measures so `scoreCandidate` never sees them: it reads them as words of
 * the ingredient's name, and "g de tomates" scores 0.5 against `Tomates` — under `CONFIDENT`, so
 * the line would be lost for having been measured too precisely. Kept apart from `MEASURES`
 * because they prove nothing on their own: an article is not evidence that a number is an amount,
 * and no ingredient is named "de", so stripping them can strand nothing either.
 */
const GLUE = new Set(["de", "du", "des", "d", "a", "of", "la", "le", "les"]);

/**
 * How many words after the number can belong to the ingredient's name.
 *
 * Four covers "pommes de terre nouvelles" and "huile d'olive vierge"; more only widens the window
 * a wrong match can be found in, since every shorter prefix is scored too and the best wins.
 */
const PHRASE_WORDS = 4;

/** Diacritics off, punctuation to spaces, so "d'olive" and "olive" are the same two words. */
const _tokensOf = (value: string): string[] =>
  foldAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/**
 * The run of text after a number that could still be naming what it counts.
 *
 * Cut at the first punctuation, conjunction or further digit, and cut on the *raw* text rather
 * than on tokens — folding turns a comma into a space, and "4 tomates, 2 oignons et du basilic"
 * would then offer "tomates 2 oignons" as one phrase. The boundary words are the ones that end a
 * noun phrase in both languages; past one of them the sentence has moved on to something else.
 */
const _contextOf = (rest: string): string => {
  const boundary = rest.search(/[,;.:!?()"“”]|\d|\b(?:et|puis|and|then|dans|avec|pendant|jusqu)\b/iu);

  return boundary === -1 ? rest : rest.slice(0, boundary);
};

/** The written token as a number. `undefined` for anything that is not one — a `1/0`, mainly. */
const _valueOf = (token: string): number | undefined => {
  const vulgar = VULGAR_FRACTIONS[token];
  if (vulgar !== undefined) return vulgar;

  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(token);
  if (fraction) {
    const denominator = Number(fraction[2]);

    return denominator === 0 ? undefined : Number(fraction[1]) / denominator;
  }

  const value = Number(token.replace(",", "."));

  return Number.isFinite(value) ? value : undefined;
};

/**
 * The best recipe line the words after a number could be naming, or `undefined` for none.
 *
 * Scored with `scoreCandidate` rather than by a comparison written here: it is the matcher the
 * import pipeline already trusts to link a free-text line to a catalog row, it is tuned against
 * the real catalog, and a second notion of "close enough" is how one screen scales a number the
 * other leaves alone. Every prefix of the phrase is scored, because the line may be one word
 * ("Tomates") or four ("Pommes de terre nouvelles") and only the longer prefix reaches the latter.
 *
 * The pool is this recipe's own lines — ten of them, not a catalog — so a wrong match has to be a
 * confident hit on a *different ingredient the cook is already using*, and `CONFIDENT` is set
 * above where the catalog's near-misses top out.
 *
 * A tie between two of the recipe's lines resolves to the first written, deliberately and unlike
 * `resolveIngredient`, which refuses one (`MARGIN`). The stake is not the same: there, a tie
 * chooses which row a recipe is stored against and gets the nutrition wrong for good. Here both candidates are lines
 * of the same recipe, the number scales by the same factor either way, and the only thing riding
 * on the choice is which glyph the step card draws beside it.
 */
const _lineNamed = (tokens: string[], lines: RecipeLine[]): RecipeLine | undefined => {
  let best: { line: RecipeLine; score: number } | undefined;

  for (let size = Math.min(PHRASE_WORDS, tokens.length); size >= 1; size -= 1) {
    const phrase = tokens.slice(0, size).join(" ");

    for (const line of lines) {
      const score = scoreCandidate(phrase, { id: line.name, name: line.name });
      if (score >= CONFIDENT && (best === undefined || score > best.score)) best = { line, score };
    }
  }

  return best?.line;
};

/**
 * Whether the words *before* a number say it is labelling something rather than measuring food.
 *
 * Two shapes: a word that numbers things ("étape 3", "thermostat 6"), and a container stating its
 * own capacity ("une casserole de 3 l"). The second is matched as the three tokens it takes,
 * because the container word alone is the innocent case — "versez dans le bol 200 g de farine".
 */
const _isLabelled = (before: string): boolean => {
  const tokens = _tokensOf(before);
  const last = tokens.at(-1);
  if (last === undefined) return false;

  if (NOT_COUNTED_BY.has(last)) return true;

  const container = tokens.at(-2);

  return GLUE.has(last) && container !== undefined && CONTAINERS.has(container);
};

/**
 * What a number at `index` is an amount of, or `undefined` when it is not an amount at all.
 *
 * `line` is absent when the number was recognised by its measure alone — the amount is real and
 * scales, but nothing in this recipe could be said to be the thing it counts.
 */
const _readAt = (
  instruction: string,
  index: number,
  token: string,
  lines: RecipeLine[],
): { line?: RecipeLine; unit?: Unit } | undefined => {
  const rest = instruction.slice(index + token.length);

  /** A degree sign or a percentage is not food, and neither survives folding into a word. */
  if (/^\s*[°%]/.test(rest)) return undefined;

  if (_isLabelled(instruction.slice(0, index))) return undefined;

  const tokens = _tokensOf(_contextOf(rest));
  if (tokens[0] !== undefined && NOT_AN_AMOUNT.has(tokens[0])) return undefined;

  let unit: Unit | undefined;
  let measured = false;
  let start = 0;
  while (start < tokens.length && (MEASURES.has(tokens[start]!) || GLUE.has(tokens[start]!))) {
    if (MEASURES.has(tokens[start]!)) {
      unit ??= MEASURES.get(tokens[start]!);
      measured = true;
    }
    start += 1;
  }

  const line = _lineNamed(tokens.slice(start), lines);

  /**
   * Either signal is enough on its own, and they answer different questions. A named line says
   * *what* the number counts; a measure says *that* it counts food — "2 cs" is a quantity in any
   * sentence, and a recipe listing `Citron` while its method says "jus de citron" must still be
   * halved. Neither present means the number is prose ("coupez en 2"), and prose stays as written.
   */
  if (!line && !measured) return undefined;

  return { ...(line && { line }), unit };
};

/**
 * The instruction cut into segments, with every identifiable amount marked.
 *
 * Numbers this file declines to identify are not emitted as segments of their own — they stay
 * inside the surrounding text, which is what makes "leave it exactly as written" the default
 * rather than a case anyone has to remember to handle.
 */
export const readInstruction = (
  instruction: string,
  lines: RecipeLine[],
): InstructionSegment[] => {
  const segments: InstructionSegment[] = [];
  let cursor = 0;

  for (const match of instruction.matchAll(NUMBER)) {
    const token = match[0];
    const index = match.index;
    const amount = _valueOf(token);
    if (amount === undefined) continue;

    const counted = _readAt(instruction, index, token, lines);
    if (!counted) continue;

    if (index > cursor) segments.push({ text: instruction.slice(cursor, index) });
    segments.push({
      text: token,
      amount,
      ...(counted.line && { line: counted.line }),
      ...(counted.unit && { unit: counted.unit }),
    });
    cursor = index + token.length;
  }

  if (cursor < instruction.length) segments.push({ text: instruction.slice(cursor) });

  return segments;
};

/**
 * A scaled amount, written back the way the cook writes numbers.
 *
 * One decimal, trailing zero gone — the same precision `formatQuantity` gives the ingredients
 * tab, so a scaled recipe does not round one way in its list and another in its method. A cook
 * reading `66.66666666666667` on a card has been shown arithmetic instead of a recipe. The separator is
 * the one the original number used, so a French method scaled from "1,5" reads "0,75" rather than
 * switching to a point mid-sentence — `_model/` has no locale, and the text itself is the only
 * honest source for that.
 */
const _write = (value: number, original: string): string => {
  const text = String(Math.round(value * 10) / 10);

  return original.includes(",") ? text.replace(".", ",") : text;
};

/**
 * One instruction rewritten for a different number of people.
 *
 * The words are untouched — only digits move. Agreeing the noun would mean pluralising in two
 * languages from a `_model/` file that knows neither, and the failure it would introduce (a wrong
 * plural on every scaled line) is worse and far more visible than the one it fixes ("1 tomates",
 * only ever when scaling down to one).
 *
 * Scaling to the servings the recipe was written for returns the very same string, so the
 * stepper's resting position is indistinguishable from not having a stepper — the same contract
 * `scaleTo` and `scaleNutrition` keep.
 */
export const scaleInstruction = (
  instruction: string,
  lines: RecipeLine[],
  written: number,
  wanted: number,
): string => {
  /** A recipe that serves nobody has no ratio to scale by, and dividing would produce infinities. */
  if (written <= 0 || wanted === written) return instruction;

  const factor = wanted / written;

  return readInstruction(instruction, lines)
    .map((segment) =>
      segment.amount === undefined ? segment.text : _write(segment.amount * factor, segment.text),
    )
    .join("");
};

/**
 * The whole method rewritten, groups and headings intact.
 *
 * Returns the array it was given when nothing moves, so the memo in `useRecipe` hands back the
 * query's own objects at rest instead of copies of them.
 */
export const scaleInstructions = (
  groups: InstructionGroup[],
  lines: RecipeLine[],
  written: number,
  wanted: number,
): InstructionGroup[] => {
  if (written <= 0 || wanted === written) return groups;

  return groups.map((group) => ({
    ...group,
    steps: group.steps.map((step) => scaleInstruction(step, lines, written, wanted)),
  }));
};

/**
 * What one step calls for, in the order it calls for it.
 *
 * This is the real answer to a question the cooking session was answering with a fixture: a step
 * has no row of its own in the schema, so what it needs can only come from its own words. Read
 * from the text *after* scaling, so the amounts are the ones the cook is being told to use.
 *
 * One entry per ingredient — a step naming the same thing twice ("half the butter… the rest of
 * the butter") lists it once, at the first amount, rather than drawing the same tile twice.
 */
export const ingredientsIn = (instruction: string, lines: RecipeLine[]): IngredientMention[] => {
  const mentions: IngredientMention[] = [];

  for (const segment of readInstruction(instruction, lines)) {
    if (segment.amount === undefined || !segment.line) continue;
    if (mentions.some((mention) => mention.line.name === segment.line!.name)) continue;

    mentions.push({ line: segment.line, amount: segment.amount, unit: segment.unit ?? "pcs" });
  }

  return mentions;
};
