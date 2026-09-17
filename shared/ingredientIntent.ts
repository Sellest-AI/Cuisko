import { UNIT_INPUTS } from "./ingredients";
import { foldAccents, STOPWORDS, type Locale } from "./translations";

/**
 * What the shopper meant by what they typed into the navigation bar.
 *
 * Three kinds and not a boolean, because the bar has to *do* three different things: send it to
 * the assistant, add the ingredient it already knows, or hand the words to the resolver and hold a
 * placeholder until it answers. A two-way fork — the one this replaces — collapsed the last two
 * into "not a match", and everything the catalog did not already hold was simply lost.
 *
 * `chat` carries WHY it is a chat because the three reasons have different confidence: a trigger
 * word and a question mark are things the shopper wrote on purpose, while `sentence` is a guess
 * made from word count. Only the guess is worth revisiting when this reads something wrong.
 */
export type Intent =
  | { kind: "chat"; reason: "trigger" | "question" | "sentence" }
  | { kind: "ingredient" }
  | { kind: "unknown" };

/**
 * The words that open a request rather than name a food, per locale.
 *
 * **Data, not code**: adding one is an edit to a list, so nobody has to touch a branch to teach the
 * bar that "montre-moi" is a question. Kept unaccented because that is the form they are compared
 * in — see `_tokens`.
 *
 * Matched only in FIRST position, and that is the whole reason this list can be short. Matched
 * anywhere, French "ou" would turn "pommes ou poires" into a question and English "can" would be
 * one keystroke from doing the same. A shopper asking a question leads with the question.
 */
export const CHAT_TRIGGERS: Record<Locale, readonly string[]> = {
  en: [
    "what", "how", "why", "when", "where", "who", "which", "whats",
    "can", "could", "should", "would", "do", "does", "did", "is", "are", "am",
    "give", "show", "tell", "find", "make", "suggest", "help", "plan", "cook",
    "recipe", "recipes", "idea", "ideas", "i",
  ],
  fr: [
    "quoi", "comment", "pourquoi", "quand", "ou", "qui", "quel", "quelle", "quels", "quelles",
    "est", "peux", "peut", "pourrais", "puis", "as", "ai",
    "donne", "montre", "trouve", "fais", "propose", "aide", "planifie", "cuisine",
    "recette", "recettes", "idee", "idees", "je",
  ],
} as const;

const ALL_TRIGGERS = new Set([...CHAT_TRIGGERS.en, ...CHAT_TRIGGERS.fr]);

const ALL_STOPWORDS = new Set([...STOPWORDS.en, ...STOPWORDS.fr]);

/**
 * Every spelling a shopper may type, not the stored codes — the same list the navigation bar's
 * parser builds its pattern from, and it has to be the same one.
 *
 * `UNITS` alone reads a French cook's own spoon as a content word: "2 cs huile olive vierge" then
 * reaches four of them, tips over `SENTENCE_MIN_WORDS`, and goes to the assistant instead of the
 * shopping list. That is a routing failure with no error behind it — the bar simply answers the
 * wrong question — and it is what made the codes going English cost anything at all here.
 */
const ALL_UNITS = new Set<string>(UNIT_INPUTS);

/**
 * How many content words it takes before this reads as a sentence rather than as a shopping item.
 *
 * Four, measured against the longest real ingredients rather than against the shortest question:
 * "farine de blé complète bio" is four tokens but two of them are stopwords, and no food in the
 * catalog reaches four *content* words. A question that does not reach four either — "des idées" —
 * is already caught by its trigger, which is why this threshold can afford to be generous and let
 * an ambiguous three-word phrase go to the resolver, where a refusal is cheap and reversible.
 */
const SENTENCE_MIN_WORDS = 4;

/** A bare quantity, with or without its unit glued on: "500g", "1,5", "2", "1/2". */
const QUANTITY_RE = /^\d+(?:[.,]\d+)?(?:\/\d+)?[a-z]*$/;

/**
 * What is left once the shopping grammar is taken out: no quantities, no units, no stopwords.
 *
 * Unaccented and lowercased, so "Où" and "ou" are one trigger and the stopword lists match what a
 * French keyboard actually produces.
 *
 * This is deliberately coarser than the navigation bar's own `readInput`, which parses fractions,
 * strips plurals and feeds a ranker. Counting words needs none of that, and a second parser that
 * agreed on the hard cases would only be a second thing to keep in step.
 */
const _tokens = (text: string) =>
  foldAccents(text.toLowerCase())
    .split(/[^\p{L}\p{N}.,/]+/u)
    .map((token) => token.replace(/^[.,/]+|[.,/]+$/g, ""))
    .filter(Boolean);

const _contentWords = (tokens: string[]) =>
  tokens.filter(
    (token) => !QUANTITY_RE.test(token) && !ALL_UNITS.has(token) && !ALL_STOPWORDS.has(token),
  );

/**
 * Free text from the navigation bar → what to do with it.
 *
 * `hasCatalogHit` is passed in rather than looked up: the rules belong to the caller, and a pure
 * function that cannot reach a database is one a fixture can pin. The bar passes whether
 * `rankSuggestions` found a confident match, which is the same evidence Enter used to act on
 * alone.
 *
 * **The rule order is the contract**, not an implementation detail:
 *
 * 1. a question mark, anywhere — the one punctuation mark that means only one thing
 * 2. a trigger word in first position
 * 3. the catalog knows it
 * 4. it is long enough to be a sentence
 * 5. otherwise: unknown, and the resolver gets a turn
 *
 * Explicit intent beats a catalog hit, which is why `"? tomate"` is a question ABOUT tomatoes
 * rather than a tomato. Reversing 2 and 3 would make every question containing a food name add
 * that food instead of answering.
 */
export const readIntent = (text: string, hasCatalogHit: boolean): Intent => {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "unknown" };

  if (trimmed.includes("?")) return { kind: "chat", reason: "question" };

  const tokens = _tokens(trimmed);
  if (tokens[0] && ALL_TRIGGERS.has(tokens[0])) return { kind: "chat", reason: "trigger" };

  if (hasCatalogHit) return { kind: "ingredient" };

  if (_contentWords(tokens).length >= SENTENCE_MIN_WORDS)
    return { kind: "chat", reason: "sentence" };

  return { kind: "unknown" };
};
