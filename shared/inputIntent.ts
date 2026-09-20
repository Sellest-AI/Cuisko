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
 * `chat` carries WHY it is a chat because the reasons have different confidence: a trigger word and
 * a question mark are things the shopper wrote on purpose, while `sentence` is a guess made from
 * word count and `model` is a judgment that replaced one of this function's two guesses.
 *
 * `model` is never returned by `readIntent` — it is what `classifyIntent` stamps on the answer it
 * sends back, so a route that reads wrong can be traced to the rule that chose it without asking
 * which layer was speaking.
 */
export type Intent =
  | { kind: "chat"; reason: "trigger" | "question" | "sentence" | "model" }
  | { kind: "ingredient" }
  | { kind: "recipe" }
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
 *
 * ⚠️ **Written as `_tokens` produces them, which means no apostrophes.** An entry like `"c'est"` or
 * `"it's"` can never match anything — the tokenizer has already taken the apostrophe out by the time
 * the comparison happens. The two languages lose it differently, and the entries below follow:
 *
 *   - **French elides**, gluing a clitic to the FRONT of a separate word: "c'est" is "ce" + "est",
 *     and `ELISION_RE` drops the clitic, so the entry to have here is plain **`est`**.
 *   - **English contracts** at the BACK of one word: "it's" is one word, so the apostrophe is simply
 *     closed up and the entry to have here is **`its`** — which is why `whats` has always been
 *     spelled that way.
 */
export const CHAT_TRIGGERS: Record<Locale, readonly string[]> = {
  en: [
    "what", "how", "why", "when", "where", "who", "which",
    "can", "could", "should", "would", "do", "does", "did", "is", "are", "am",
    "give", "show", "tell", "find", "make", "suggest", "help", "plan", "cook",
    "recipe", "recipes", "idea", "ideas", "i",
    // Contractions, closed up the way `_tokens` leaves them. "im" and "id" are the ones to watch:
    // both are real words elsewhere, but neither opens the name of a food.
    "its", "whats", "hows", "wheres", "im", "ive", "id", "dont", "doesnt", "cant", "wont", "isnt",
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
 * The clitics a language glues to the FRONT of a separate word with an apostrophe, per locale.
 *
 * **Without this, rule 2 cannot see a French question at all.** The tokenizer splits on the
 * apostrophe, so "c'est quoi les calories des pâtes" arrives as `["c", "est", "quoi", …]` — the
 * trigger word is in position 1, rule 2 only reads position 0, and the sentence falls through to
 * rule 3, where "pâtes" hits the catalog and the question becomes pasta on the shopping list.
 *
 * Dropping the clitic restores exactly what rule 2 was written to assume: **a shopper asking a
 * question leads with the question word.** "c'est" leads with one, it is just wearing a "c".
 *
 * **Data per locale, like `CHAT_TRIGGERS`, because this is grammar and grammar is per language.**
 * Every locale that elides needs its own row, and the row is the whole of the work: Italian would be
 * `["l", "un", "dell", "nell", "all", "dall", "quest"]` and Catalan close to French's. Merged into
 * one pattern rather than selected by locale, for the reason the triggers are merged — `readIntent`
 * is not told which language it is reading, and a shopper mid-sentence has not told anyone either.
 *
 * English is empty and that is not an oversight: it does not elide, it CONTRACTS at the back of one
 * word ("it's", "don't"), which `_tokens` handles by closing the apostrophe up rather than by
 * dropping anything. The two halves of that are what make `est` and `its` the correct entries above.
 */
const ELISIONS: Record<Locale, readonly string[]> = {
  en: [],
  fr: ["c", "j", "d", "n", "l", "m", "t", "s", "qu", "jusqu", "lorsqu", "puisqu", "quoiqu"],
};

/**
 * Both apostrophes, because a phone keyboard produces `’` and a desktop one `'` — matching only the
 * straight one would fix this on the web and leave it broken on the devices the app ships to.
 *
 * `\b` is what keeps it from reaching inside a word: there is no boundary before the "d" of
 * "aujourd'hui", so that one keeps its apostrophe and is closed up by the step after instead.
 */
const ELISION_RE = new RegExp(
  `\\b(${[...new Set([...ELISIONS.en, ...ELISIONS.fr])].join("|")})['’]`,
  "g",
);

/**
 * What is left of an apostrophe once the elisions are gone: a contraction, which is one word.
 *
 * Closed up rather than split, so "it's" becomes `its` and "what's" becomes `whats` — the form
 * `CHAT_TRIGGERS` has always been written in. Splitting instead would put `s` in the tokens and
 * leave "it" carrying the question, which is the mirror of the bug the elision rule fixes.
 */
const APOSTROPHE_RE = /['’]/g;

/**
 * What is left once the shopping grammar is taken out: no quantities, no units, no stopwords.
 *
 * Unaccented, lowercased and un-elided, so "Où" and "ou" are one trigger, "c'est" leads with the
 * word it means to lead with, and the stopword lists match what a French keyboard actually produces.
 *
 * This is deliberately coarser than the navigation bar's own `readInput`, which parses fractions,
 * strips plurals and feeds a ranker. Counting words needs none of that, and a second parser that
 * agreed on the hard cases would only be a second thing to keep in step.
 */
const _tokens = (text: string) =>
  foldAccents(text.toLowerCase())
    .replace(ELISION_RE, "")
    .replace(APOSTROPHE_RE, "")
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
 * `hasCatalogHit` and `hasRecipeHit` are passed in rather than looked up: the rules belong to the
 * caller, and a pure function that cannot reach a database is one a fixture can pin. The bar
 * passes whether `rankSuggestions` found a confident match, and whether its ruling came out as
 * recipes — the very evidence the panel is drawn from, so that Enter cannot disagree with the list
 * the cook is looking at.
 *
 * **The rule order is the contract**, not an implementation detail:
 *
 * 1. a question mark, anywhere — the one punctuation mark that means only one thing
 * 2. a trigger word in first position
 * 3. the catalog knows it
 * 4. a recipe is named by it
 * 5. it is long enough to be a sentence
 * 6. otherwise: unknown, and the resolver gets a turn
 *
 * Explicit intent beats a catalog hit, which is why `"? tomate"` is a question ABOUT tomatoes
 * rather than a tomato. Reversing 2 and 3 would make every question containing a food name add
 * that food instead of answering.
 *
 * 4 sits below 3 and not above it for the same reason, one step further down: a word the catalog
 * holds is a shopping item even when a dish shares its name. And it sits ABOVE 5 because a dish
 * name is not a sentence — "boeuf bourguignon" would otherwise fall to the resolver, which invents
 * the ingredient it cannot find and leaves a dish in the food catalog under its own name.
 */
export const readIntent = (
  text: string,
  hasCatalogHit: boolean,
  hasRecipeHit = false,
): Intent => {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "unknown" };

  if (trimmed.includes("?")) return { kind: "chat", reason: "question" };

  const tokens = _tokens(trimmed);
  if (tokens[0] && ALL_TRIGGERS.has(tokens[0])) return { kind: "chat", reason: "trigger" };

  if (hasCatalogHit) return { kind: "ingredient" };

  if (hasRecipeHit) return { kind: "recipe" };

  if (_contentWords(tokens).length >= SENTENCE_MIN_WORDS)
    return { kind: "chat", reason: "sentence" };

  return { kind: "unknown" };
};

/**
 * Whether this ruling is one of the two GUESSES above, rather than one of the four written rules.
 *
 * The two are rule 5, which counts words, and rule 6, which has run out of rules. Everything else
 * read something the shopper put there on purpose — a question mark, a leading trigger word, a
 * catalog hit, a recipe title — and is not up for revision.
 *
 * **This is the line a model may be asked to redraw, and it lives here so that only one thing knows
 * where it is.** The navigation bar reads it to decide whether to ask, and
 * `classifyIntent.manual.test.ts` reads it to prove that each of its fixtures still reaches the
 * model at all. Two copies of this predicate would let a fixture drift into testing an input the
 * bar never sends.
 */
export const isGuess = (intent: Intent) =>
  intent.kind === "unknown" || (intent.kind === "chat" && intent.reason === "sentence");
