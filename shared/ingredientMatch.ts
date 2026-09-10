/**
 * Scoring a catalog row against a free-text ingredient name — "200g de pâtes" against `pasta-dry`.
 *
 * Why this exists at all: Convex's search index returns rows in relevance order and hands back
 * **no score**, so at the call site "nothing matched" and "a bad match ranked first" look
 * identical. `searchCatalog(ctx, { query: "patates" })` returns `chips de patates` as row 1 if the
 * catalog holds nothing better, and linking that row silently corrupts the recipe's nutrition
 * total and its grocery line, with no error anywhere. A number is what lets a caller refuse.
 *
 * Pure and shared rather than living beside the query, so it can be tuned against the real catalog
 * with no LLM and no database in the loop — see `convex/functions/ingredients/resolveIngredient.ts`
 * for the caller that turns these numbers into a decision.
 */

/** A catalog row reduced to what scoring can see — id, name and synonyms, in ONE locale. */
export type Candidate = { id: string; name: string; aliases?: string[] };

/**
 * At or above this, the name is linked to the row without asking anyone.
 *
 * 0.78, measured against the seeded catalog rather than guessed — the fixture is
 * `convex/functions/ingredients/__tests__/linkableThreshold.test.ts`, which seeds the REAL catalog
 * and pushes realistic recipe lines through `searchWidened`. (`shared/__tests__/ingredientMatch.test.ts`
 * tests this file's scoring against hand-written candidates, which is a different question: it
 * cannot tell you whether 0.78 still separates the rows the catalog actually holds.) The numbers
 * the fixture pins are:
 *
 * - every correct match of a realistic recipe line lands at **0.9 or above** — a quantity and a
 *   preparation qualifier are stripped before scoring, so those lines score as the bare name does
 *   (1 for the name itself, 0.9 for a recorded synonym), and 0.85 is the ceiling for a spelling
 *   this file merely found similar;
 * - the best *wrong* row that the catalog actually holds tops out at **0.70** — `sweet-potato` for
 *   "patates", `whole-wheat-pasta` for "pâtes", `chips de patates` for "patates";
 * - an ingredient the catalog does not hold at all (sumac, harissa, kombu) never passes 0.23.
 *
 * 0.78 is the middle of the 0.70–0.85 gap. Moving it below 0.70 auto-links sweet potatoes into a
 * recipe that asked for potatoes — which corrupts the nutrition total and the grocery line, and
 * produces no error anywhere. Move it only with a fixture that shows why.
 */
export const CONFIDENT = 0.78;

/**
 * Below this, a row is not worth showing the cook at all.
 *
 * The gap between the two is where a human is asked, and it has to exist: a line scoring 0.5 is a
 * real ingredient the catalog spells differently, and dropping it as "unmatched" throws away the
 * one thing that would have resolved it in a tap. Set above the 0.23 the catalog's noise floor
 * reaches on an ingredient it simply does not hold.
 */
export const PLAUSIBLE = 0.4;

/**
 * The floor for "is this already in the catalog under some other spelling?", below `PLAUSIBLE`.
 *
 * A different question, deliberately answered more loosely. `PLAUSIBLE` guards a recipe line,
 * where offering a cook a wrong row costs a tap. This one guards the decision to INVENT a catalog
 * row, where being too strict costs a duplicate ingredient that never goes away — two `carotte`
 * rows, one seeded and one created, splitting every grocery list and every nutrition total between
 * them from then on. Asymmetric costs, so an asymmetric threshold.
 *
 * 0.3, and the room to put it there is measured, not guessed: the doc on `CONFIDENT` above records
 * that an ingredient the catalog does not hold at all never passes **0.23**, and the best *wrong*
 * row the catalog holds tops out at 0.70. 0.3 sits just above that noise floor, so a genuine miss
 * still reads as a miss. Everything between here and `PLAUSIBLE` is handed to the step that can
 * afford to look at it — the resolver, which has a taxonomy and two composition tables to check a
 * near-miss against before it believes it.
 */
export const RESOLVABLE = 0.3;

/**
 * How far ahead of the runner-up a confident row has to be before it is linked unasked.
 *
 * Two rows can both be exact: `Blanc de poulet` and `Blanc de poulet en tranches` normalize to the
 * same two words, and both score 1. Without a margin the winner is whichever the search index
 * happened to return first — a coin flip, silently resolved, between raw chicken and deli slices.
 * A tie is not a confident match; it is the one case worth a tap.
 */
export const MARGIN = 0.05;

/**
 * An inexact spelling never outranks a synonym somebody wrote down on purpose.
 *
 * Without the ceiling, "tomatoes" scoring 0.89 against `tomato` would beat the recorded alias hit
 * of another row, and the ordering of a suggestion list would depend on plural endings rather than
 * on the catalog's own knowledge.
 */
const FUZZY_CEILING = 0.85;

/** An exact hit on a recorded synonym. Below a name hit, above anything fuzzy. */
const ALIAS_EXACT = 0.9;

/** How hard a candidate is punished for carrying words the query never mentioned. */
const EXTRA_WEIGHT = 0.6;

/** A candidate word counts as "accounted for" from here up — below it, it is an extra word. */
const TOKEN_MATCHED = 0.6;

/**
 * Words that carry no identity: articles, prepositions, and the packaging words a cook writes
 * around an ingredient. Both sides are stripped, so removing them cannot break a pair that agreed.
 */
const STOPWORDS = new Set([
  // articles and prepositions
  "de", "du", "des", "d", "la", "le", "les", "l", "un", "une", "au", "aux", "et", "en",
  "of", "the", "a", "an", "and", "with",
  // how much of it, rather than what it is — "2 gousses d'ail" is garlic
  "gousse", "brin", "pincee", "tranche", "boite", "sachet", "botte", "poignee", "cuillere",
  "feuille", "branche", "morceau", "tasse", "bocal", "barquette", "paquet",
  "clove", "pinch", "slice", "can", "tin", "jar", "bunch", "sprig", "handful", "cup",
  "tablespoon", "teaspoon", "piece", "packet", "package", "bag",
]);

/**
 * Preparation qualifiers — the words this matcher must strip to find the row, and exactly the
 * reason the sanitize prompt hoists them into steps instead.
 *
 * "200g butter, softened" is `butter` plus an action with an hour of lead time. Strip it here and
 * capture it nowhere and the recipe is unmakeable while looking complete; that trade is settled in
 * the prompt, not here. Stripping is symmetric — a catalog name made only of these keeps them.
 */
const QUALIFIERS = new Set([
  // en
  "fresh", "freshly", "frozen", "dried", "chopped", "sliced", "diced", "minced", "grated",
  "shredded", "crushed", "peeled", "seeded", "softened", "melted", "sifted", "cooked", "raw",
  "thinly", "finely", "roughly", "large", "small", "medium", "ripe", "optional", "extra",
  /**
   * ⚠️ `hache` and `hachee` are NOT here, and their absence is the rule rather than an oversight.
   *
   * Mincing an onion does not change what a shopper buys, which is why `emince` is stripped two
   * lines down. Mincing a cow does: `steak haché` and `steak` are two counters, two prices and two
   * nutrition tables, and the same is true of `poudre d'amande` against `amande` — the ranker's
   * own prompt calls that a non-match in so many words. Stripping the word made them one string,
   * so the catalog scored them 1.0 and linked them without ever asking the ranker the question.
   */
  // fr
  "frais", "fraiche", "fraiches", "surgele", "surgelee", "seche", "sechee", "emince", "emincee",
  "rape", "rapee", "coupe", "coupee", "pele", "pelee", "fondu", "fondue",
  "ramolli", "ramollie", "tamise", "tamisee", "cuit", "cuite", "cru", "crue", "finement",
  "grossierement", "gros", "grosse", "petit", "petite", "moyen", "moyenne", "bio",
  /**
   * A form, not an identity — and the two English words next to it are deliberately absent.
   * "sucre en poudre" is the sugar every French recipe means; stripping "poudre" is what lets it
   * reach `white-sugar` instead of losing to `Piment en poudre` on the shared word. English
   * "ground" and "powdered" stay: "ground beef" is not beef and "powdered sugar" is not sugar.
   */
  "poudre", "moulu", "moulue", "powder",
]);

/** A quantity glued to the name — "200g", "2", "1/2". Never part of what the ingredient is. */
const _isQuantity = (token: string) => /^\d/.test(token);

/**
 * A GRADE the shop prints — "5%", "80/20" — rewritten to one letter-leading token, `pct5`.
 *
 * The rewrite exists because every other rule in this file conspires to destroy it. `_fold` turns
 * "%" into a space, `_isQuantity` drops anything starting with a digit, and between them
 * "steak haché 5%" and "steak haché 20%" both reduce to the same two words and score **1.0** — an
 * exact match, linked at `CONFIDENT` without the ranker ever being asked. Four times the fat, on
 * somebody's shopping list, with no error anywhere.
 *
 * A number a shop prints is identity, not quantity: 5% and 20% mince, 70% and 85% chocolate, whole
 * and semi-skimmed milk are different products on different shelves. So the grade survives folding
 * as a word — `pct` leads, so `_isQuantity` cannot see a digit — and `_similarity` then refuses to
 * find two of them merely similar.
 *
 * **A slash is a grade only when the fraction is improper**, which is what separates the two
 * notations a kitchen uses for one character: recipes write proper fractions ("1/2 cup"), and
 * butchers write improper ratios ("80/20", "95/5"). The catalog's own seeded mince is
 * `Bœuf haché (80/20)`, so this is not a hypothetical form.
 *
 * A decimal keeps its fraction behind a `d` rather than a dot, which `_fold` would split in two:
 * "lait 1,5%" is `pct1d5`, and must not collide with the `pct15` of a 15% cream.
 */
const _PERCENT = /(\d+)(?:[.,](\d+))?\s*%/g;
const _RATIO = /(\d+)\s*\/\s*(\d+)/g;

const _gradeToken = (whole: string, fraction?: string) =>
  ` pct${whole}${fraction ? `d${fraction}` : ""} `;

const _grades = (value: string) =>
  value
    .replace(_PERCENT, (_match, whole: string, fraction?: string) => _gradeToken(whole, fraction))
    .replace(_RATIO, (match, left: string, right: string) =>
      Number(left) > Number(right) ? _gradeToken(left) : match);

/** A token `_grades` wrote. Nothing a shopper types reaches this shape by accident. */
const _isGradeToken = (token: string) => /^pct\d/.test(token);

/**
 * Whether one raw word a shopper typed is a GRADE rather than a quantity — "5%", "80/20".
 *
 * Exported because the navigation bar has to answer the same question before this file ever sees
 * the text, and answering it twice is how the two disagree: the bar strips what it reads as a
 * quantity, so a grade it misreads is deleted before the resolver is even called — "boeuf haché
 * 95/5" arrived as "boeuf haché", and the 95/5 was separately billed to the shopper as 19 pieces.
 *
 * Defined through `_grades` rather than beside it, so there is one rule and not two (ADR 0011).
 */
export const isGrade = (token: string): boolean => _isGradeToken(_grades(token).trim());

/** Diacritics off, punctuation to spaces — "Pâtes (sèches)" and "pates seches" must agree. */
const _fold = (value: string) =>
  _grades(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * French and English plurals, to the extent three rules can.
 *
 * The two English endings are here rather than left to the similarity below because this also
 * writes the term the *search index* is queried with (`searchTerms`), and an index match is
 * all-or-nothing: "tomatoe" scores 0.85 against "tomato" but retrieves nothing at all, so the row
 * never reaches scoring. Nothing beyond these is guessed — "-aux" mangles more words than it saves.
 */
const _singularize = (token: string) => {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("oes")) return token.slice(0, -2);

  return /[^s]s$|x$/.test(token) ? token.slice(0, -1) : token;
};

/**
 * A name reduced to the words that identify it.
 *
 * The two fallbacks are what keep a name from reducing to nothing: an ingredient genuinely called
 * "fresh cream" would otherwise arrive as an empty token list and match everything equally.
 */
const _tokenize = (value: string): string[] => {
  const raw = _fold(value)
    .split(" ")
    .filter((token) => token && !_isQuantity(token))
    .map(_singularize);
  const meaningful = raw.filter((token) => !STOPWORDS.has(token));
  const identifying = meaningful.filter((token) => !QUALIFIERS.has(token));

  return identifying.length > 0 ? identifying : meaningful.length > 0 ? meaningful : raw;
};

const _editDistance = (left: string, right: string): number => {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(substitution, previous[j]! + 1, current[j - 1]! + 1);
    }

    previous = current;
  }

  return previous[right.length]!;
};

/**
 * How close two words are, 0..1 — edit distance over the longer of the two.
 *
 * Bigram overlap was the first attempt and it cannot do this job: "pâtes" and "patates" share
 * every bigram of the shorter word and score 0.86, which is a confident match between pasta and
 * potatoes. Measuring against length is what separates a one-letter plural ending (0.86, still a
 * match) from a whole missing syllable (0.67, no longer one).
 *
 * Words of one or two letters compare by equality, where a single edit is the whole word.
 */
const _similarity = (left: string, right: string): number => {
  if (left === right) return 1;
  // A grade is equal or it is different; there is no "nearly". Left to the edit distance below,
  // `pct5` and `pct20` score 0.6 — over `TOKEN_MATCHED`, so the candidate would count the wrong
  // grade as an accounted-for word and the pair would clear `CONFIDENT` on its other two.
  if (_isGradeToken(left) || _isGradeToken(right)) return 0;
  if (left.length < 3 || right.length < 3) return 0;

  return 1 - _editDistance(left, right) / Math.max(left.length, right.length);
};

/**
 * What to ask the search index for, given what the cook wrote.
 *
 * The index matches terms, not meaning: "3 oignons, émincés" retrieves nothing, because no row is
 * spelled that way and the quantity and the qualifier are two terms too many. Scoring cannot save
 * a row that was never returned, so the query is reduced to its identifying words first — the same
 * reduction both sides of `scoreCandidate` get, which is what keeps retrieval and ranking agreeing
 * about what the cook asked for.
 *
 * Empty when the name was only a quantity and qualifiers; the caller decides what that means.
 */
export const searchTerms = (query: string): string =>
  // The one place retrieval and ranking are deliberately asked different questions. A grade is
  // identity to `scoreCandidate` and pure noise to an index that never stored the `%` — "pct5"
  // matches no document, and asking for it can only dilute the terms that do.
  _tokenize(query).filter((token) => !_isGradeToken(token)).join(" ");

/**
 * The grade tokens in a name — exactly what `searchTerms` throws away.
 *
 * The inverse of the filter above, and defined against the same tokenizer so the two cannot
 * disagree about what a grade is. It exists because a grade can survive a *translation*: the
 * resolver looks an unknown word up in a taxonomy filed under grade-free spellings, so "steak
 * haché 5%" finds an entry named `steak haché` and the 5% is dropped on the way in. Re-searching
 * the catalog with the bare spelling then links a shopper's 5% mince to the seeded `Bœuf haché
 * (80/20)` — the exact confusion `_grades` exists to prevent, undone one step later.
 *
 * Returning tokens rather than the raw words is what makes them re-attachable: `pct5` is already
 * folded, so appending it to a spelling survives `_fold` unchanged and reaches `scoreCandidate`
 * as the identity it is.
 */
export const gradesIn = (query: string): string[] =>
  _tokenize(query).filter(_isGradeToken);

/**
 * Preparations the SHOP did, as opposed to the ones the cook does.
 *
 * A deliberately tiny subset of `QUALIFIERS`, and the line between them is who performed the verb.
 * Cooking beef is something the cook does after buying it, so `raw beef` and `cooked beef` are one
 * shopping decision and must fold together — which is why `cuit` and `cru` stay qualifiers. Drying
 * a tomato is something the shop did before selling it: `tomates` and `tomates séchées` are two
 * products, two shelves, two prices, and roughly ten times apart on every nutrition figure.
 *
 * **`frozen` is NOT here, and that is a decision, not an omission.** Frozen peas are peas: you cook
 * them the same and they count the same. Only drying concentrates a food enough to make it a
 * different ingredient. `frozen` and `surgelé` are already `QUALIFIERS`, so leaving them off this
 * list is all it takes — they fold away like any other preparation.
 *
 * ⚠️ **`en conserve` is a known gap, not a decision.** Tinned tomatoes are tomatoes by the same
 *    argument as frozen peas, but `conserve` was never a `QUALIFIER`, so it survives as an
 *    identifying word and `tomates en conserve` gets its own walk today. Fixing it means adding the
 *    word to `QUALIFIERS`, which changes `searchTerms` — and that builds the taxonomy index keys,
 *    the widened catalog query and the client's suggestions, so it is a retrieval change and not a
 *    fold change. It does not belong here, and it costs one redundant walk rather than wrong data.
 *
 * **`fresh` is not here either, because it is the default state.** Dropping it from both sides
 * leaves `coriander` against `dried coriander`, which is already the distinction we want; listing
 * it would instead split `fresh tomatoes` from `tomatoes`, which are the same thing.
 *
 * Both gendered forms, like `QUALIFIERS` — `_singularize` runs once, so `séchées` arrives as
 * `sechee` and `séchés` as `seche`.
 */
const PRESERVATION = new Set(["dried", "seche", "sechee"]);

/**
 * The preservation words in a name — read BEFORE `QUALIFIERS` strips them.
 *
 * Not built on `_tokenize`, and it cannot be: `_tokenize` returns the identifying tokens, which is
 * exactly the list these words have already been removed from. So this re-walks the raw fold, and
 * takes the same quantity filter and the same singularizer so it cannot disagree with the tokens
 * it will be appended to.
 *
 * Exported for `foldedIngredientName`, which is the only caller and the only place the distinction
 * matters: retrieval may ignore how a food was preserved, because the catalog is searched widened
 * and the ranker weighs the rest of the name. Identity may not — folding `tomates` and `tomates
 * séchées` to one key resolves one of them and silently links the other to it.
 */
export const preservationIn = (query: string): string[] =>
  _fold(query)
    .split(" ")
    .filter((token) => token && !_isQuantity(token))
    .map(_singularize)
    .filter((token) => PRESERVATION.has(token));

const _bestSimilarity = (token: string, against: string[]): number =>
  against.reduce((best, other) => Math.max(best, _similarity(token, other)), 0);

/**
 * Token sets compared both ways, which is the whole trick.
 *
 * *Coverage* asks how much of what the cook typed the candidate accounts for. On its own it ranks
 * "chips de patates" top for "patates", because the candidate does contain the word. The second
 * term is the correction: a candidate carrying words the query never mentioned is penalized in
 * proportion to how many, so a two-word row that matched on one of them loses to the row that
 * matched on all of them. That penalty is the entire reason the potato wins.
 */
const _fuzzyScore = (queryTokens: string[], candidateTokens: string[]): number => {
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;

  const coverage =
    queryTokens.reduce((sum, token) => sum + _bestSimilarity(token, candidateTokens), 0) /
    queryTokens.length;
  if (coverage === 0) return 0;

  const accounted = candidateTokens.filter(
    (token) => _bestSimilarity(token, queryTokens) >= TOKEN_MATCHED,
  ).length;
  const extraRatio = 1 - accounted / candidateTokens.length;

  return coverage * (1 - EXTRA_WEIGHT * extraRatio);
};

/**
 * One catalog row against one free-text name, 0..1.
 *
 * In order of what dominates: an exact hit on the normalized name, then an exact hit on a
 * normalized alias, then the fuzzy comparison — which can never reach either, by `FUZZY_CEILING`.
 */
export const scoreCandidate = (query: string, candidate: Candidate): number => {
  const queryTokens = _tokenize(query);
  if (queryTokens.length === 0) return 0;

  const key = queryTokens.join(" ");
  const nameTokens = _tokenize(candidate.name);
  if (nameTokens.join(" ") === key) return 1;

  const aliasTokens = (candidate.aliases ?? []).map(_tokenize);
  if (aliasTokens.some((tokens) => tokens.join(" ") === key)) return ALIAS_EXACT;

  const fuzzy = [nameTokens, ...aliasTokens].reduce(
    (best, tokens) => Math.max(best, _fuzzyScore(queryTokens, tokens)),
    0,
  );

  return Math.min(fuzzy, FUZZY_CEILING);
};

/**
 * Every candidate scored, best first. Rows sharing nothing with the query are dropped rather than
 * returned at 0 — a caller ranking a search page should not have to filter noise back out.
 *
 * Ties keep the order they came in, which is the search index's own relevance order.
 */
export const rankCandidates = (
  query: string,
  candidates: Candidate[],
): { id: string; score: number }[] =>
  candidates
    .map((candidate) => ({ id: candidate.id, score: scoreCandidate(query, candidate) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);
