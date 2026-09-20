import { isGrade } from "@shared/ingredientMatch";
import { normalizeUnit, UNIT_INPUTS, type Unit } from "@shared/ingredients";
import { foldAccents, STOPWORDS } from "@shared/translations";
import { distance } from "fastest-levenshtein";
import { useMemo } from "react";

import { useDebounce } from "~/hooks/useDebounce";
import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useQueryHeld } from "~/lib/convex/client";

export type Suggestion = {
  id: string;
  name: string;
  emoji: string;
  imageUrl?: string;
  /**
   * How this food is bought, straight off the catalog row — the unit a shop sells it in and how
   * much of it a line means. Used whenever the shopper named neither, which is most of the time:
   * "gnocchis" is a 500 g packet, and one piece of it is not a thing anybody buys.
   */
  defaultUnit: Unit;
  defaultQuantity: number;
  /**
   * The other ways to say it. Searched, never shown: the card draws `name`, so that "patates"
   * and "pommes de terre" stay one ingredient on screen.
   */
  aliases?: string[];
};


/** Minimum similarity (0-1) for Enter to auto-select a suggestion. */
const AUTO_SELECT_THRESHOLD = 0.85;
/** Minimum similarity for a typed word to "touch" a word of a suggestion. */
const FUZZY_WORD_THRESHOLD = 0.75;
/** Within this margin the top two candidates are too close to call, so neither is selected. */
const AMBIGUITY_MARGIN = 0.05;
/** Below this, the input is too short to decide anything. */
const MIN_QUERY_LENGTH = 3;

const GLOBAL_STOPWORDS = new Set([...STOPWORDS.en, ...STOPWORDS.fr]);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every spelling a shopper may type, not just the stored codes: a French cook writes "2 cs", and
// a pattern built from UNITS alone would leave the spoon in the search words. `normalizeUnit` is
// what turns whichever one they wrote into the code that gets stored.
// Sorted longest first: "kg" has to be tested before "g".
const UNITS_PATTERN = [...UNIT_INPUTS]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

// 500g / 500 g / 1,5kg / 2 / fractions like 1/2
const QUANTITY_RE = new RegExp(
  `^(\\d+(?:[.,]\\d+)?(?:\\/\\d+)?)\\s*(${UNITS_PATTERN})?$`,
  "i"
);

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/** Lowercased and unpunctuated, but still accented — the form the stopword lists are written in. */
const toComparable = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Tested before the accents come off, and never after: stripping them first turns "thé" into
 * "the", hands a real ingredient to the English stopword list, and makes it unsearchable — its
 * label normalises to the empty string, so nothing can ever match it.
 */
const isStopword = (word: string) => GLOBAL_STOPWORDS.has(toComparable(word));

/**
 * Applies the same normalisation to what is typed and to the labels it is matched against:
 * lowercase, unaccented, unpunctuated, singular.
 * The plural is only stripped from words longer than 3 letters, so "jus", "ris" and "des"
 * survive intact.
 */
const normalizeWord = (word: string) => {
  const clean = foldAccents(toComparable(word));
  return clean.length > 3 && clean.endsWith("s") ? clean.slice(0, -1) : clean;
};

const normalizeName = (name: string) =>
  name
    .split(/\s+/)
    .filter((word) => !isStopword(word))
    .map(normalizeWord)
    .filter(Boolean)
    .join(" ");

/** Everything a suggestion can be found under: its name, then its synonyms. */
const toLabels = (suggestion: Suggestion) =>
  [suggestion.name, ...(suggestion.aliases ?? [])].map(normalizeName).filter(Boolean);

/* -------------------------------------------------------------------------- */
/* Quantity                                                                   */
/* -------------------------------------------------------------------------- */

/** "1,5" -> 1.5, "1/2" -> 0.5, "500" -> 500, and "95/5" -> nothing at all. */
const parseAmount = (raw: string): number | null => {
  const [numerator, denominator] = raw.replace(",", ".").split("/");
  const value = Number(numerator);
  if (Number.isNaN(value)) return null;
  if (denominator === undefined) return value;

  const divisor = Number(denominator);
  if (!divisor) return null;

  /**
   * A slash is two different things in a kitchen, and only the PROPER fraction is an amount.
   * Recipes write "1/2 citron"; a butcher writes "95/5" and means the lean-to-fat ratio. Dividing
   * that one gave a shopper 19 pieces of mince, and — worse, because it was silent — deleted the
   * grade from the words handed to the resolver, so the row it created could not carry it either.
   *
   * `isGrade` is the shared rule the matcher scores with, not a second copy of it (ADR 0011).
   */
  return value > divisor ? null : value / divisor;
};

/**
 * Whether this token is an amount, which is strictly narrower than "looks like one".
 *
 * A predicate rather than the bare regex, because three call sites below used `QUANTITY_RE.test`
 * and every one of them has to agree with what `parseAmount` will actually do. A token the regex
 * matched and the parser then refused is a word, and must survive into `rest` — that is the whole
 * bug: `rest` is what the resolver is asked about.
 */
const isQuantity = (token: string) => {
  const match = QUANTITY_RE.exec(token);

  return !!match && parseAmount(match[1]!) !== null;
};

const parseQuantity = (
  tokens: string[]
): { amount: number | null; unit: Unit | null } => {
  for (let i = 0; i < tokens.length; i++) {
    const match = QUANTITY_RE.exec(tokens[i]!);
    if (!match) continue;

    const amount = parseAmount(match[1]!);
    if (amount === null) continue;

    const inline = normalizeUnit(match[2]);
    if (inline) return { amount, unit: inline };

    const next = normalizeUnit(tokens[i + 1]);
    if (next) return { amount, unit: next };

    return { amount, unit: null };
  }

  return { amount: null, unit: null };
};

/**
 * The tokens left once the quantity and its unit are taken out.
 * Raw tokens on purpose, so that "1,5kg" and "1/2" are still recognisable to QUANTITY_RE.
 */
const toWords = (tokens: string[]) =>
  tokens
    // A grade goes out of the SEARCH words and stays in `rest`, which is the same split
    // `searchTerms` makes on the server: "95/5" identifies the mince, and no index ever stored it.
    .filter((token) => !isQuantity(token) && !isGrade(token) && normalizeUnit(token) === undefined)
    .filter((token) => !isStopword(token))
    .map(normalizeWord)
    .filter((word) => word.length > 1);

/* -------------------------------------------------------------------------- */
/* Similarity                                                                 */
/* -------------------------------------------------------------------------- */

/** Normalised Levenshtein: 1 = identical, 0 = nothing in common. */
const similarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - distance(a, b) / Math.max(a.length, b.length);
};

/**
 * How well a label answers what was typed, which is what orders the list.
 * A prefix scores 1 ("tomat" -> "tomate"), a containment 0.9, and anything else falls back to
 * fuzzy similarity so a typo still finds its ingredient.
 *
 * **`covered` is not `score` rounded, and the two answer different questions.** `score` orders the
 * list and is deliberately fractional — a containment is worth 0.9, a typo as little as 0.75 — so
 * a label that answers every word typed can still total less than the word count. `covered` counts
 * the words that found an answer at all, which is the only form the "did this label account for
 * everything?" question can be asked in. Comparing `score / words.length` to 1 instead would read
 * every typo as a word the catalog could not explain.
 */
const scoreLabel = (words: string[], label: string) => {
  const labelWords = label.split(" ");

  return words.reduce(
    (total, word) => {
      let best = 0;
      for (const labelWord of labelWords) {
        if (labelWord.startsWith(word)) {
          best = 1;
          break;
        }
        best = Math.max(best, labelWord.includes(word) ? 0.9 : similarity(word, labelWord));
      }
      return best >= FUZZY_WORD_THRESHOLD
        ? { score: total.score + best, covered: total.covered + 1 }
        : total;
    },
    { score: 0, covered: 0 },
  );
};

/**
 * A suggestion's best label for this input, and what it scored.
 *
 * The labels compete rather than merge: "chips de patates" must not score by taking "chips" from
 * the name and "patate" from a synonym, which a single pooled word list would let it do.
 * On a tie the shorter label wins — it is the one most likely typed, which is what makes "patate"
 * mean pommes de terre rather than patates douces.
 */
const bestLabel = (words: string[], labels: string[]) =>
  labels.reduce(
    (best, label) => {
      const { score, covered } = scoreLabel(words, label);
      const wins = score > best.score || (score === best.score && label.length < best.label.length);
      return wins ? { score, covered, label } : best;
    },
    { score: 0, covered: 0, label: labels[0] ?? "" }
  );


/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

/** Below this the catalog is not asked at all — one letter cannot narrow ~200 rows usefully. */
const MIN_SEARCH_LENGTH = 2;

/**
 * What the input means, before any catalog is consulted: how much, in what unit, and the words
 * left over once those are taken out.
 *
 * Split out because the words are needed twice — once to ask the server, and once to rank what it
 * sends back — and parsing the same text differently in those two places is how a suggestion list
 * ends up ranking against something the shopper never typed.
 */
export const readInput = (text: string) => {
  const tokens = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const { amount, unit } = parseQuantity(tokens);
  const words = toWords(tokens);

  /**
   * The same input with only the shopping grammar taken out — still accented, still plural, still
   * in the order it was typed. `query` is not a substitute: its normalisation is what lets a typo
   * find a row we already hold, and it is exactly wrong for asking a dictionary about a word we do
   * not, where "pommes de terre" must not arrive as "pomme terre".
   */
  const rest = tokens.filter((token) => !isQuantity(token) && normalizeUnit(token) === undefined).join(" ");

  return { amount, unit, words, rest, query: words.join(" ") };
};

/**
 * Whether every word typed is accounted for by this one title — the rule `bestLabel` applies to a
 * catalog label, applied to a recipe's name.
 *
 * **The leftovers only count on one side.** Words the title carries and the cook did not type are
 * free, which is what keeps "beurre" an ingredient when the catalog answers `beurre doux`; words
 * the cook typed and nothing accounts for are what makes "boeuf bourguignon" stop being a request
 * for beef. Asking the question the other way round would invert both.
 *
 * Exported because the navigation bar filters a page of recipes with it — see `useBarSuggestions`.
 * It is the second half of that gate, and it lives here rather than in the recipes module so that
 * it cannot drift from the `words`, the stopwords and the thresholds it shares with the first half.
 */
export const coversTitle = (text: string, title: string) => {
  const { words } = readInput(text);
  if (!words.length) return false;

  const label = normalizeName(title);
  if (!label) return false;

  return scoreLabel(words, label).covered === words.length;
};

/**
 * Orders a set of candidates against what was typed, and decides whether Enter may commit one.
 *
 * **The server narrows; this ranks.** A search index answers "which rows contain these terms",
 * which is not the same question as "which one did they mean" — prefix beats containment beats a
 * typo, the shorter label wins a tie, and a near-tie is refused outright. Keeping that here also
 * keeps it testable against a fixture rather than against whatever the catalog happens to hold.
 *
 * Exported for that test. The hook below is the call site; nothing else should reach for this.
 */
export const rankSuggestions = (text: string, candidates: Suggestion[]) => {
  const { amount, unit, words, rest, query } = readInput(text);

  // Labels normalised once, then reused for both the ranking and the match.
  const entries = candidates.map((suggestion) => ({
    suggestion,
    labels: toLabels(suggestion),
  }));

  const scored = entries.map((entry) => ({ ...entry, ...bestLabel(words, entry.labels) }));

  const suggestions = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.label.length - b.label.length)
    .map((entry) => entry.suggestion);

  /**
   * Whether the catalog accounts for the whole input, which is what decides that this is a
   * shopping item at all rather than the name of a dish.
   *
   * Any one label answering every word is enough — the labels compete for the ordering, but this
   * question is about the catalog as a whole. "beurre" is covered by `beurre doux` even though the
   * shopper typed neither word of "doux"; "boeuf bourguignon" is covered by nothing, because no
   * label explains "bourguignon".
   *
   * False on an empty input, and deliberately: a shopper who has typed nothing has not typed
   * something the catalog failed to explain.
   */
  const isFullyCovered = words.length > 0 && scored.some((entry) => entry.covered === words.length);

  // Strict match: the whole input against a whole label. Comparing word by word would let
  // "tomate" match "Tomates cerises".
  let matchingSuggestion: Suggestion | null = null;

  if (query.length >= MIN_QUERY_LENGTH) {
    const ranked = entries
      .map((entry) => ({
        suggestion: entry.suggestion,
        score: Math.max(0, ...entry.labels.map((label) => similarity(query, label))),
      }))
      .sort((a, b) => b.score - a.score);

    // The runner-up is weighed before the threshold is applied, never after: filtering first
    // hides a near-tie behind the cut-off, and Enter then commits the very coin-flip the margin
    // exists to refuse.
    const [best, runnerUp] = ranked;
    const isAmbiguous = !!runnerUp && best!.score - runnerUp.score < AMBIGUITY_MARGIN;

    if (best && best.score >= AUTO_SELECT_THRESHOLD && !isAmbiguous)
      matchingSuggestion = best.suggestion;
  }

  return {
    /**
     * **Null when the shopper said nothing, and deliberately not filled in here.**
     *
     * This function is about a string, not about a food, so the only default available to it is
     * one piece of whatever-it-is — which is how "gnocchis" became a single gnocchi. Left empty,
     * the blank travels to the two places that DO know which row is meant: the card below picks
     * the suggestion's own `defaultUnit`, and `usePendingIngredients` picks the resolved row's,
     * seconds later, once there is a row at all.
     */
    amount,
    unit,
    /** What the resolver is asked about when nothing here matched. See `readInput`. */
    rest,
    suggestions,
    hasSuggestions: suggestions.length > 0,
    matchingSuggestion,
    isFullyCovered,
  };
};

/**
 * What the navigation bar offers while someone types.
 *
 * The candidate set comes from the ingredient catalog, searched server-side in the caller's
 * locale: the index matches a name or any of its synonyms, with or without accents, which is what
 * makes "patates" reach pommes de terre without shipping ~200 rows to every device. The ordering
 * is still decided here — see `rankSuggestions`.
 *
 * The search is `anon`: the catalog is reference data, so the bar suggests before sign-in.
 */
export const useSuggestions = (text: string) => {
  const locale = useLocale();
  const { query } = useMemo(() => readInput(text), [text]);

  /**
   * Two separate reasons the list must not flicker, and each needs its own fix.
   *
   * Debouncing stops a query per keystroke — the answer to "carro" is never the one the shopper
   * wanted, and asking for it is work the server does and the screen throws away. But settling
   * later does not stop the list emptying when the settled query finally changes, because the
   * cache is keyed on the arguments and has no entry for the new ones yet. `useQueryHeld` is what
   * keeps the previous matches on screen until the better ones arrive.
   */
  const settled = useDebounce(query);

  const { data } = useQueryHeld(
    api.router.ingredients.search.anon,
    settled.length >= MIN_SEARCH_LENGTH ? { query: settled, locale } : "skip",
  );

  const candidates = useMemo(
    (): Suggestion[] =>
      (data ?? []).map((row) => ({
        id: row._id,
        name: row.name,
        emoji: row.emoji,
        imageUrl: row.image?.sizes.thumbnail?.url,
        aliases: row.aliases,
        defaultUnit: row.defaultUnit,
        defaultQuantity: row.defaultQuantity,
      })),
    [data],
  );

  return rankSuggestions(text, candidates);
};
