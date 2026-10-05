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

import type { Category } from "./categories";
import { foldAccents, type Locale } from "./translations";

/**
 * A catalog row reduced to what scoring can see — id, name and synonyms, in ONE locale.
 *
 * `category` decides what a mincing word means (see `MINCING`). Absent, the word keeps the meaning
 * each language's list gave it before categories were read, so a caller scoring two free-text names
 * against each other (`lookupHit`, a recipe's own lines) is unchanged.
 */
export type Candidate = { id: string; name: string; aliases?: string[]; category?: Category };

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
 * A tie is not a confident match: `resolveIngredient` hands it on to its later steps, where a
 * model weighs the candidates, rather than linking either one.
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
export const ALIAS_EXACT = 0.9;

/** How hard a candidate is punished for carrying words the query never mentioned. */
const EXTRA_WEIGHT = 0.6;

/** A candidate word counts as "accounted for" from here up — below it, it is an extra word. */
const TOKEN_MATCHED = 0.6;

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
 * A word list, spelled the way the tokens it is tested against are spelled: singularized.
 *
 * Every list below is looked up with a token `_singularize` has already been through, so a word
 * written in its natural form and ending in `s` could never be found. `frais` arrives as `frai`
 * and `gros` as `gro`, and both sat in `QUALIFIERS` doing nothing — "Origan frais" did not answer
 * "origan", and "gros sel" was not salt by the rule meant for it. Written naturally and folded
 * here, a list cannot hold a word it will never see.
 */
const _vocabulary = (words: string[]) => new Set(words.map(_singularize));

/** `_vocabulary` for a word list that maps each word to a form. */
const _forms = (pairs: [word: string, form: string][]) =>
  new Map(pairs.map(([word, form]) => [_singularize(word), form]));

/**
 * Words that carry no identity: articles, prepositions, and the packaging words a cook writes
 * around an ingredient. Both sides are stripped, so removing them cannot break a pair that agreed.
 *
 * **Two lists, because the fold makes one language's word the other's.** `thé` folds to `the`, and
 * one list tested after folding dropped the tea as an English article — "thé noir" searched for
 * `noir`. So each list is tested in the spelling its language is typed in, and no caller needs a
 * locale. French is tested FOLDED, because a shopper types it with or without accents and the list
 * is written without them (`boite`, `cuillere`). English has no accents to lose, so it is tested on
 * the word AS TYPED, where `thé` is still not `the`.
 *
 * ⚠️ **`clove` is not here, and that is the rule rather than an oversight.** It is the one packaging
 * word that is also a food: stripped, "ground cloves" searched for `ground`, which is ground beef's
 * word, and the spice was never retrieved. The phrasings where it measures garlic ("2 garlic
 * cloves", "a clove of garlic") are aliases on the garlic row instead, where they cannot collide.
 */
const STOPWORDS_FR = _vocabulary([
  // articles and prepositions — `a` is "à" folded, which the English list, tested as typed, misses
  "de", "du", "des", "d", "la", "le", "les", "l", "un", "une", "au", "aux", "et", "en", "a",
  // how much of it, rather than what it is — "2 tranches de jambon" is ham
  "brin", "pincee", "tranche", "boite", "sachet", "botte", "poignee", "cuillere",
  "branche", "morceau", "tasse", "bocal", "barquette", "paquet", "piece",
  /**
   * ⚠️ `gousse` and `feuille` are NOT here, for the reason `clove` is not in English: each measures
   * one food and names a part of another. Stripped, "feuille de curry" scored 0.9 against curry
   * powder through its `curry` alias, and "gousse de cardamome" 1.0 against the ground spice. The
   * phrasings where they measure ("gousse d'ail", "feuilles de basilic") are aliases on those rows.
   */
]);

const STOPWORDS_EN = _vocabulary([
  "of", "the", "a", "an", "and", "with",
  "pinch", "slice", "can", "tin", "jar", "bunch", "sprig", "handful", "cup",
  "tablespoon", "teaspoon", "piece", "packet", "package", "bag",
]);

/**
 * Preparation qualifiers — the words this matcher must strip to find the row, and exactly the
 * reason the sanitize prompt hoists them into steps instead.
 *
 * "200g butter, softened" is `butter` plus an action with an hour of lead time. Strip it here and
 * capture it nowhere and the recipe is unmakeable while looking complete; that trade is settled in
 * the prompt, not here. Both sides are stripped to find the row, but only the query's qualifiers
 * are ignored: one a catalog name carries is identity, and `scoreCandidate` keeps it (see
 * `_shape`). A catalog name made only of these keeps them.
 */
const QUALIFIERS = _vocabulary([
  // en
  "fresh", "freshly", "frozen", "chopped", "sliced", "diced", "minced", "grated",
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
  "frais", "fraiche", "fraiches", "surgele", "surgelee", "emince", "emincee",
  "rape", "rapee", "coupe", "coupee", "pele", "pelee", "fondu", "fondue",
  "ramolli", "ramollie", "tamise", "tamisee", "cuit", "cuite", "cru", "crue", "finement",
  "grossierement", "gros", "grosse", "petit", "petite", "moyen", "moyenne", "bio",
  /**
   * ⚠️ `poudre`, `moulu`, `powder`, `ground`, `séché` and `dried` are NOT here, for the reason
   * `hache` is not: grinding and drying are the shop's work, so each makes another product.
   *
   * Garlic powder and garlic are two jars on two shelves; dried and fresh tomatoes are roughly ten
   * times apart on every nutrition figure. Stripped, "ail en poudre" scored 1.0 against `Ail` and
   * "coriandre séchée" 1.0 against fresh coriander, both linked unasked. The one phrase that wanted
   * the strip, "sucre en poudre" for plain sugar, is an alias on `white-sugar` instead.
   *
   * `frozen` and `fresh` stay: frozen peas are peas, and fresh is the state a food is sold in.
   * How a form is then scored is `FORMS`'s business.
   */
]);

/**
 * The form the shop made a food into, each spelling mapped to one canonical form.
 *
 * Form words are identity (garlic powder is not garlic), so `QUALIFIERS` keeps them. But they are
 * identity of a narrow kind, and scoring them as ordinary words broke two ways: a shared "dried"
 * carried half the coverage, so "dried barley" cleared `CONFIDENT` against `Dried parsley`; and
 * "dried" is two edits from "red", so it read as `Red onion`'s colour. So a form is compared the way
 * a grade is, equal or different, and to compare it the spellings of one form become one token:
 * "séchées", "séché" and "dried" are one form, "en poudre", "moulue" and "ground" another.
 *
 * **Tested in the spelling each language is typed in, for the reason `STOPWORDS` has two lists.**
 * Tested after the fold, one language's word can be the other's: `thé` folded to `the` and was
 * dropped as an English article. So French is tested folded (it is typed with or without accents)
 * and English as typed. `sec` is not here: "vin sec" is a dry wine, not a dried one.
 *
 * Keyed by `Locale`, so a language added to `SUPPORTED_LOCALES` fails typecheck here until its form
 * words exist, rather than matching its powders onto the fresh food in silence.
 *
 * Read only by scoring (`_shape`). Retrieval keeps the words as written, since that is what the
 * search index stored.
 */
const FORMS: Record<Locale, { spelling: "folded" | "typed"; words: Map<string, string> }> = {
  fr: {
    spelling: "folded",
    words: _forms([
      ["poudre", "~ground"], ["moulu", "~ground"], ["moulue", "~ground"],
      ["seche", "~dried"], ["sechee", "~dried"],
    ]),
  },
  en: {
    spelling: "typed",
    words: _forms([["powder", "~ground"], ["ground", "~ground"], ["dried", "~dried"]]),
  },
};

/** The canonical form a word names in any language, if it names one. */
const _formOf = ({ typed, token }: { typed: string; token: string }) =>
  Object.values(FORMS)
    .map(({ spelling, words }) => words.get(spelling === "folded" ? token : typed))
    .find(Boolean);

/** A token `FORMS` wrote. The tilde survives no fold, so nothing typed reaches it. */
const _isFormToken = (token: string) => token.startsWith("~");

/**
 * What a candidate's word score is multiplied by when the two names do not carry the same forms.
 *
 * Low enough that no pair can reach `CONFIDENT` with a form on one side only (1 × 0.7 = 0.7), and
 * high enough that the fresh food stays above `PLAUSIBLE`: "ail en poudre" is not `Ail`, but `Ail`
 * is a candidate worth showing the ranker.
 */
const FORM_MISMATCH = 0.7;

/**
 * The words for mincing, which name a product or a preparation depending on the food.
 *
 * Mincing a cow makes another product: `steak haché` and `steak` are two counters and two nutrition
 * tables, which is why `haché` left `QUALIFIERS`. Mincing a clove of garlic does not: "ail haché" is
 * the garlic bulb, cut. No word list can hold both, and the two languages had split the difference
 * each its own way: `minced` stayed a qualifier, so "minced lamb" scored 1.0 against `Lamb`, while
 * `haché` stayed identity, so "ail haché" fell under the bar against `Ail`. The row's category is
 * what tells them apart (`_qualifiersFor`), and it holds for a row a shopper grew as for a seeded
 * one, since every row has one.
 *
 * Written folded, as `QUALIFIERS` is tested, and keyed by `Locale` like `FORMS`.
 */
const MINCING: Record<Locale, string[]> = { fr: ["hache", "hachee"], en: ["minced"] };

/** The categories whose rows are a different product once minced. */
const MINCED_IS_A_PRODUCT: ReadonlySet<Category> = new Set(["MEAT", "SEAFOOD"]);

const _MINCING_WORDS = _vocabulary(Object.values(MINCING).flat());
const _QUALIFIERS_FOR_MEAT = new Set([...QUALIFIERS].filter((word) => !_MINCING_WORDS.has(word)));
const _QUALIFIERS_FOR_THE_REST = new Set([...QUALIFIERS, ..._MINCING_WORDS]);

/** The qualifiers a name is read with against a row of this category. */
const _qualifiersFor = (category: Category | undefined): ReadonlySet<string> => {
  if (category === undefined) return QUALIFIERS;

  return MINCED_IS_A_PRODUCT.has(category) ? _QUALIFIERS_FOR_MEAT : _QUALIFIERS_FOR_THE_REST;
};

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

/**
 * Diacritics off, punctuation to spaces — "Pâtes (sèches)" and "pates seches" must agree.
 *
 * **The accent fold is `foldAccents`, not a copy of it (ADR 0012).** That function already expands
 * `œ` and `æ` before it normalises, and it has to: the pair carries no decomposition mapping in
 * Unicode, so `NFD` leaves them whole and the `[^a-z0-9]` whitelist below turns them into a SPACE
 * — folding `bœuf` to the two tokens `b` and `uf`, and `œuf` to `uf`.
 *
 * This function used to strip diacritics itself and skip the ligatures, which put the two halves
 * of search out of step: `@shared/search` indexed a row under `boeuf` while this folded the cook’s
 * query to `b uf`. The damage was symmetric wherever both sides carried the ligature, which is
 * what hid it — it bit only where the spellings disagreed, and a cook typing `œuf` at a row
 * holding `oeufs` retrieved NOTHING, walked all five resolve steps and had a duplicate row
 * invented for them. Calling the one folder keeps the index and the query a single rule.
 */
const _fold = (value: string) =>
  foldAccents(_grades(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * A name split into the three layers every rule below reads it at: every word, the words carrying
 * meaning, and the words carrying identity.
 *
 * One split rather than two, because `_tokenize` and `foldCost` ask different questions OF THE
 * SAME split — what a name reduces to, and how much reducing it threw away. Written twice, the two
 * copies disagree about what a qualifier is the first time one of the lists above grows.
 */
const _layers = (value: string, qualifiers: ReadonlySet<string> = QUALIFIERS) => {
  const raw = _words(value)
    .filter(({ folded }) => !_isQuantity(folded))
    .map(({ typed, folded }) => ({ typed: _singularize(typed), token: _singularize(folded) }));
  const meaningful = raw
    .filter(({ typed, token }) => !STOPWORDS_FR.has(token) && !STOPWORDS_EN.has(typed))
    .map(({ token }) => token);
  const identifying = meaningful.filter((token) => !qualifiers.has(token));
  const forms = new Map(
    raw.flatMap((word) => {
      const form = _formOf(word);
      return form ? [[word.token, form] as const] : [];
    }),
  );

  return { raw: raw.map(({ token }) => token), meaningful, identifying, forms };
};

/**
 * `_fold`'s words, each paired with the spelling it was typed in — what `STOPWORDS_EN` is tested
 * against, since the fold is exactly what turns `thé` into `the`.
 *
 * Split on the typed text first and folded word by word, so the pairing cannot slip. The two splits
 * agree: a letter, a combining accent or a digit is what `_fold` keeps, and a character that folds
 * to nothing it keeps (an `ß`) splits the word here exactly as it would there.
 */
const _words = (value: string): { typed: string; folded: string }[] =>
  _grades(value)
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .flatMap((typed) => _fold(typed).split(" ").filter(Boolean).map((folded) => ({ typed, folded })));

/**
 * A name reduced to the words that identify it.
 *
 * The two fallbacks are what keep a name from reducing to nothing: an ingredient genuinely called
 * "fresh cream" would otherwise arrive as an empty token list and match everything equally.
 */
const _tokenize = (value: string): string[] => _pick(_layers(value));

type _Layers = Pick<ReturnType<typeof _layers>, "raw" | "meaningful" | "identifying">;

const _pick = ({ raw, meaningful, identifying }: _Layers): string[] =>
  identifying.length > 0 ? identifying : meaningful.length > 0 ? meaningful : raw;

/**
 * How many words folding removed from this spelling. 0 means the name survived whole.
 *
 * **Exported for the taxonomy index, where this number decides which food owns a name.** That index
 * is a dictionary keyed by the folded form, so two spellings routinely compete for one key: an
 * onion's own name, and onion powder's after `poudre` came off. Both fold to `oignon` and only one
 * of them is an onion. Whichever the upstream file happened to list first used to win, which filed
 * `beurre` under butterfat (via `beurre fondu`), `pomme de terre` under potato flour, `jambon`
 * under diced ham and `citron` under lemon LEAF — each then answering with the wrong food's CIQUAL
 * figures.
 *
 * **A count, not a yes-or-no, and that is the whole design.** The predicate this replaces asked
 * only whether a QUALIFIER came off, so `Dés de jambon` — which loses `dés` and `de`, both
 * stopwords — still claimed `jambon` outright. Counting every dropped word closes that, and it has
 * to count rather than answer "did folding drop anything?": `pomme de terre` itself drops `de`, and
 * a yes-or-no rule would disqualify the potato from its own name. It survives because it drops one
 * word where `pomme de terre en poudre` drops three.
 *
 * A name that is nothing BUT qualifiers costs 0, which is `_tokenize`'s own fallback read back:
 * "poudre" reduces to itself rather than to nothing, so nothing was dropped and the spelling is its
 * own.
 *
 * ⚠️ **A dropped NUMBER is counted, like any other dropped word**, which is why this counts from
 * the raw fold rather than from `_layers().raw` — that layer has already filtered quantities out.
 * The additives are what force it: OFF files colours as `Vert 1724` and `Noir 7984`, and with the
 * number free those cost 0 on the bare `vert` and `noir` — keys any food reduced to that one word
 * would lose to them. That is how a French shopper asking for green tea once got the dye E143,
 * complete with its missing CIQUAL code, while `thé` still folded into the English stopword `the`
 * (see `STOPWORDS_EN`). A number that is the only thing separating two names is doing identifying
 * work, and a rule that ranks by what folding destroyed has to see it.
 */
export const foldCost = (value: string): number =>
  _fold(value).split(" ").filter(Boolean).length - _tokenize(value).length;

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
  // A form likewise: "dried" is two edits from "red", and was read as a red onion's colour.
  if (_isFormToken(left) || _isFormToken(right)) return 0;
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
 * What to ask the search index for when every row it returns will be SCORED: `searchTerms` without
 * the form words, for the reason it drops grades.
 *
 * A form is identity to `scoreCandidate` and noise to retrieval. Every staple sold dry carries
 * "dried" in its search text, so "dried thyme" asked for that word too and the index answered with
 * rice and lentils, up to the page limit, before it reached the thyme. Retrieved on `thyme` alone,
 * both `Thyme` and `Dried thyme` come back and the score tells them apart.
 *
 * Not `searchTerms` itself: that one also keys the taxonomy and a recipe's lines, where "tomates"
 * and "tomates séchées" must stay two keys. A name made only of a form keeps it.
 */
export const retrievalTerms = (query: string): string => {
  const { forms } = _layers(query);
  const words = searchTerms(query).split(" ").filter((token) => !forms.has(token));

  return words.length > 0 ? words.join(" ") : searchTerms(query);
};

const _bestSimilarity = (token: string, against: string[]): number =>
  against.reduce((best, other) => Math.max(best, _similarity(token, other)), 0);

/**
 * Whether `spelling` keeps every word that identifies `name`: each of the name's tokens finds one
 * in the spelling scoring OVER `TOKEN_MATCHED`.
 *
 * A hard rule where `_fuzzyScore` is a soft one. There, a missing word only lowers `coverage`, so
 * "Pesto" still scores 0.5 against "pesto rouge" and clears `RESOLVABLE` on the shared word alone.
 * That is right for ranking a search page and wrong for deciding a source measured THIS food: the
 * colour was the identity, and USDA's basil pesto became the figures of a red one.
 *
 * The spelling is read with its qualifiers kept, since a word it carries can only help the name.
 *
 * **Strictly over, where `_fuzzyScore` counts from the bar up.** Exactly 0.6 is two edits in five
 * letters: `red` against `ready`, `pesto` against `pasta`. Those are different words, and at `>=`
 * the "ready-to-serve" on USDA's basil pesto kept the `red` of a red pesto.
 */
export const keepsEveryWord = (name: string, spelling: string): boolean => {
  const kept = _shape(spelling, QUALIFIERS).words;

  return _tokenize(name).every((token) => _bestSimilarity(token, kept) > TOKEN_MATCHED);
};

/**
 * Token sets compared both ways, which is the whole trick.
 *
 * *Coverage* asks how much of what the cook typed the candidate accounts for. On its own it ranks
 * "chips de patates" top for "patates", because the candidate does contain the word. The second
 * term is the correction: a candidate carrying words the query never mentioned is penalized in
 * proportion to how many, so a two-word row that matched on one of them loses to the row that
 * matched on all of them. That penalty is the entire reason the potato wins.
 */
const _wordScore = (queryTokens: string[], candidateTokens: string[]): number => {
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

const _withoutForms = (tokens: string[]) => {
  const words = tokens.filter((token) => !_isFormToken(token));
  return words.length > 0 ? words : tokens;
};

const _formsOf = (tokens: string[]) => [...new Set(tokens.filter(_isFormToken))].sort().join(" ");

/**
 * `_wordScore` on the words that name the food, with the forms judged apart: equal, or the score
 * is cut by `FORM_MISMATCH`. Counted among the words, a shared form vouched for two different foods
 * ("dried barley", `Dried parsley`); a form the other side lacks only cost coverage, which left
 * room for a strong word match to carry the pair anyway. A name that is nothing but a form keeps
 * its form as its words, as `_tokenize` keeps a name made only of qualifiers.
 */
const _fuzzyScore = (queryTokens: string[], candidateTokens: string[]): number => {
  const words = _wordScore(_withoutForms(queryTokens), _withoutForms(candidateTokens));

  return _formsOf(queryTokens) === _formsOf(candidateTokens) ? words : words * FORM_MISMATCH;
};

/**
 * One catalog row against one free-text name, 0..1.
 *
 * In order of what dominates: an exact hit on the normalized name, then an exact hit on a
 * normalized alias, then the fuzzy comparison — which can never reach either, by `FUZZY_CEILING`.
 */
export const scoreCandidate = (query: string, candidate: Candidate): number => {
  const qualifiers = _qualifiersFor(candidate.category);
  const asked = _shape(query, qualifiers);
  if (asked.tokens.length === 0) return 0;

  const key = asked.tokens.join(" ");
  const said = new Set(asked.words);
  // The row's qualifiers the cook did not write: identity the query never asked for.
  const unasked = (spelling: Shape) => spelling.qualifiers.filter((token) => !said.has(token));
  const isExact = (spelling: Shape) =>
    spelling.tokens.join(" ") === key && unasked(spelling).length === 0;

  const name = _shape(candidate.name, qualifiers);
  if (isExact(name)) return 1;

  const aliases = (candidate.aliases ?? []).map((alias) => _shape(alias, qualifiers));
  if (aliases.some(isExact)) return ALIAS_EXACT;

  const fuzzy = [name, ...aliases].reduce(
    (best, spelling) =>
      Math.max(best, _fuzzyScore(asked.tokens, [...spelling.tokens, ...unasked(spelling)])),
    0,
  );

  return Math.min(fuzzy, FUZZY_CEILING);
};

type Shape = { tokens: string[]; words: string[]; qualifiers: string[] };

/**
 * A spelling read the two ways `scoreCandidate` needs: what identifies it (`_tokenize`), and the
 * qualifiers that were folded off to get there.
 *
 * **The qualifiers are kept because which side carried them decides what they mean.** In the query
 * they are the cook's own preparation, and ignoring them is right: "3 oignons émincés" is an onion.
 * In a catalog name they are the shop's, written there on purpose, and they make the row a
 * different product: "Sliced cooked chicken" is not what "chicken" asks for, and "Piment en poudre"
 * is not every chili. So a row's qualifiers must appear in the query for an exact match, and count
 * as extra words in the fuzzy one when they do not.
 *
 * Empty for a name made only of qualifiers, which is `_tokenize`'s fallback: "Frais" is its own name.
 */
const _shape = (value: string, qualifiers: ReadonlySet<string>): Shape => {
  const { raw, meaningful, identifying, forms } = _layers(value, qualifiers);

  return {
    // Each form word as its canonical form, so "séchées" and "dried" are one token here.
    tokens: _pick({ raw, meaningful, identifying }).map((token) => forms.get(token) ?? token),
    words: meaningful.length > 0 ? meaningful : raw,
    qualifiers:
      identifying.length > 0
        ? meaningful.filter((token) => qualifiers.has(token) && !DEFAULT_STATE.has(token))
        : [],
  };
};

/**
 * The qualifiers a catalog name may carry without naming a different product: fresh is the state a
 * food is sold in unless something says otherwise.
 * Without this, "ginger" tied `Fresh ginger` with ground ginger, and "tagliatelle" cost a model call
 * to reach the only tagliatelle the catalog holds.
 *
 * Written naturally, like every list here: `_vocabulary` spells it the way tokens arrive.
 */
const DEFAULT_STATE = _vocabulary(["fresh", "frais", "fraiche"]);

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
