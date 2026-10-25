import {
  askTypeSafe,
  type ChoiceAnswer,
  type ChoiceQuestion,
  type NoulAnswer,
  type NoulQuestion,
  type ReportUsage,
} from "@convex/lib/typesafe/ask";
import { retryPromise } from "@shared/helpers";
import { LANGUAGE_NAMES, SUPPORTED_LOCALES, type Locale } from "@shared/translations";

import { curatedSpellingsIn, type LookupHit, type MeasuredResult } from "./lookup/lookupHit";

/**
 * Is one of the near-misses the catalog search found the SAME FOOD the shopper typed, and if so, is
 * what they typed worth storing on that row?
 *
 * Step 4 of `resolveIngredient`, first half: `resolveWithAgent` asks this before paying for a row,
 * and asks a question of its own of each source's search page (`pickMeasuredFood`) before any
 * figure is kept.
 * A judgment and not a generation, so it runs on TypeSafe's Jev rather than on a chat model: the
 * candidates are the options, "none" is one more, and the reply is a probability per option. There
 * is no index to hallucinate, no JSON to parse, and no confidence a model states about itself — the
 * number thresholded below is the distribution's own.
 *
 * **Cheaper than the chat ranker it replaced, as billed.** Qwen 3.7 Flash read a ~2,300-token system
 * prompt per term and was billed ~$0.000073 a call through Alibaba Cloud (2026-09-22). Its bake-off
 * recorded $0.0000202, which was right for the bench: it sent the same prompt run after run, so the
 * input was billed at the cached rate, and production calls were billed in full. Here: ~$0.000026
 * a term with no match, and ~$0.000043 with a match and its alias question.
 *
 * **And more accurate.** Qwen's bake-off (nine fixtures × five runs × two runs of the prompt, 90
 * answers) put a wrong food on the list 3 times in 90 — 3.3% — including `steak haché 5%` linked to
 * `steak haché` at 0.85, and missed the `échqlote` → shallot match once in 10. It also linked `cider
 * vinegar` to balsamic in dev. Jev, 2026-09-24: no wrong link over twelve to fourteen fixtures across
 * eight runs of the current question, and no wrong candidate above 0.24. Fewer answers than Qwen's 90, so a rate is not yet claimed.
 *
 * **Two calls, and the second depends on the first.** Whether the typed word is worth storing is a
 * question about the word AND the food it was matched to, so it cannot be asked before the match is
 * known, and it is not asked at all when nothing matched.
 */

type Candidate = { id: string; name: string };

/** Anything the shopper's words were already looked up under, per language. Curated sources only. */
export type Dictionary = Partial<Record<Locale, string[]>>;

type Input<C extends Candidate> = {
  text: string;
  locale: Locale;
  candidates: readonly C[];
  dictionary?: Dictionary;
  /**
   * Handed each call's usage, for the action that asked to record against its trace. Never part of
   * what Jev reads: `matchState` picks its fields by name.
   */
  report?: ReportUsage;
  /** Another System One model than `ask.ts` pins, named only by the manual tests to compare. */
  model?: string;
};

/**
 * The probability the picked candidate has to carry before it is linked.
 *
 * Read off `probabilities[choice]` and NOT `confidence`: TypeSafe's confidence measures how
 * concentrated the whole distribution is, so a pick at 0.61 can report 0.42. What decides a link is
 * how likely THIS candidate is to be the food.
 *
 * High, for the reason it always was: a missed match costs one generation, and a wrong one puts a
 * different food on somebody's shopping list with no error anywhere. Measured by
 * `__tests__/matchIngredient.manual.test.ts`; re-run it when the question changes.
 *
 * **Measured 2026-09-24 on jev-1.13, fourteen fixtures over several runs: right links 0.93–1.00,
 * the most any wrong candidate drew 0.24** (`kiwi` for kaki; `amandes effilées` ~0.2 for amande).
 * The answers move by a few points between runs, so read the gap, not a cell.
 *
 * @limitation It is also the floor of `judgeMeasured`, a looser question, and it was not set from
 * it. Measured 2026-10-25 on jev-1.13: right results 0.80–0.99, the most a wrong one drew 0.51, so
 * the weakest right result sits on the floor. `pickMeasuredFood.manual.test.ts` sets it apart if a
 * run says so.
 */
export const MATCHED = 0.8;

/**
 * The probability of yes the alias question has to reach before the typed word is stored.
 *
 * A word not stored costs one call the next time it is typed, and a word stored wrongly indexes
 * the row under a keyboard slip forever — so the floor sits in the gap, nearer the slips' side
 * than the words' only as far as the measurement allows.
 *
 * **Measured 2026-09-24, several runs: real words 0.78–0.97, slips and phrases 0.05–0.18** (0.34 at
 * worst under an earlier wording). It was 0.8 first, which sat INSIDE the words' range: a brand
 * people shop by (`moutarde amora`) drew 0.78–0.82 and was stored on some runs and not others.
 * 0.6 leaves ~0.2 below the least sure word and ~0.26 above the worst slip ever seen. A new slip
 * reported in the wild belongs in the manual test before this moves.
 */
export const ALIAS_WORTH_SAVING = 0.6;

/** The option meaning "none of them". Ours, and read by the model like every other option key. */
export const NONE = "none";

/**
 * The option keys, one per candidate, in list order.
 *
 * The key IS what the model reads, so it is the candidate's name as the catalog writes it. Two
 * candidates can share a name (a row per language that was never merged), and a map cannot hold a
 * key twice, so a repeat gets its position appended — as does a candidate literally named "none",
 * which would otherwise be the no-match answer.
 */
export const optionsFor = (candidates: readonly Candidate[]): string[] => {
  const seen = new Set([NONE]);

  return candidates.map(({ name }, index) => {
    const trimmed = name.trim();
    const key = seen.has(trimmed.toLowerCase()) ? `${trimmed} (${index + 1})` : trimmed;

    seen.add(key.toLowerCase());
    return key;
  });
};

/**
 * What the model is told about the shopper, and nothing about the catalog: the candidates are the
 * options, not part of the state.
 *
 * The dictionary is the evidence the cheap steps already gathered — the OFF taxonomy files `jus de
 * citron` under lemon juice before this call ever happens — and it is left out rather than sent
 * empty, so "nothing looked it up" and "the lookup found nothing" never read the same.
 */
export const matchState = ({ text, locale, dictionary }: Omit<Input<Candidate>, "candidates">) => {
  const stated = SUPPORTED_LOCALES.filter((key) => dictionary?.[key]?.length);

  return {
    shopperTyped: text,
    language: LANGUAGE_NAMES[locale],
    ...(stated.length && {
      foodDictionary: Object.fromEntries(
        stated.map((key) => [LANGUAGE_NAMES[key], dictionary?.[key]]),
      ),
    }),
  };
};

/**
 * The rules the old ranker prompt carried, cut to what a judgment needs. Each is one of the
 * fixtures in the manual test, so a rule dropped here shows up there as a wrong link.
 *
 * **Short, because every word is billed on every unresolved term — but not shorter.** TypeSafe
 * adds ~270 input tokens of its own to any call, so this text is the only part of the bill we
 * control. Measured 2026-09-24: folding the grade, form and shelf rules into one line, and cutting
 * `none` to its first sentence, saved another ~70 tokens and let `steak haché` draw 0.72 for "steak
 * haché 5%" — 0.08 under the floor. A rule stays one sentence with its own example.
 */
const _MATCH_INSTRUCTIONS = {
  question: "Which option is the same food the shopper typed? Options may be in English or French.",
  rules: [
    "Same food: another language, a misspelling, a plural, a regional word, or a brand beside it " +
    "(\"ketchup heinz\" is ketchup).",
    "A food sharing a word is a different food: cider and balsamic vinegar, lemon and orange juice.",
    "A different form is a different product: tomato and tomato paste, almond and flaked almonds.",
    "A broader kind or shelf is not the item: pain de mie is not pain blanc.",
    "A word added to a product's name can make another product: pesto rouge (tomato) is not pesto (basil).",
    "A number in a name is a grade: steak haché 5% is neither steak haché 20% nor steak haché.",
    "A brand never picks a kind: \"chocolat lindt\" against milk, dark and white chocolate is none.",
    "A foodDictionary, when given, says what the shopper's words mean.",
  ],
};

const _NONE_CRITERION =
  "No option is that exact food. A different food sharing a word, a different form or kind of " +
  "the same product, a broader shelf, or a choice between kinds the shopper did not make is not a " +
  "match.";

/**
 * The question asked of a source's search page, which is not the catalog's.
 *
 * **A catalog link and a set of figures fail differently.** A shopping list needs the exact item,
 * so `_MATCH_INSTRUCTIONS` calls a broader kind another food. Figures only need a food measured the
 * same way: plain olive oil measures what extra virgin does, and a database title qualifies its
 * food — "Egg, whole, raw, fresh" — where a catalog name does not. Asked the catalog question, every
 * model tried on 2026-10-25 (three Jevs and three others) refused `egg` its whole egg.
 *
 * Its examples stay out of `pickMeasuredFood.manual.test.ts`'s pages, so the test measures the rule
 * and not the words.
 */
const _MEASURED_INSTRUCTIONS = {
  question:
    "Which result measured the food the shopper typed? Results are titles from a nutrition " +
    "database, in any language.",
  rules: [
    "A title names the food, then how it was measured: \"Apples, raw, with skin\" measured apple.",
    "Same food: another language, a plural, a synonym, or the form it is usually sold in " +
    "(\"Thon au naturel\" for \"thon en boîte\").",
    "A broader kind measured the food when the shopper's extra words barely change its figures: " +
    "\"Honey\" for \"miel de lavande\".",
    "A part is not the whole: orange zest is not an orange.",
    "A dish, or a product made from the food, is another food: apple juice and apple pie are not apples.",
    "A variety, or a word that makes another product, changes the figures: \"Yogurt, Greek\" is " +
    "not plain yogurt, \"Cream cheese\" is not cheese.",
    "A foodDictionary, when given, says what the shopper's words mean.",
  ],
};

const _MEASURED_NONE_CRITERION =
  "No result measured this food: each is another food, a part of it, a dish or product made from " +
  "it, or a variety with other figures.";

/** The pick → the candidate to link, or nothing. Pure, so what we DO with a 0.7 is unit-tested. */
export const readMatchAnswer = <C extends Candidate>(
  answer: ChoiceAnswer<string>,
  candidates: readonly C[],
): C | undefined => {
  if (answer.choice === NONE) return undefined;
  if ((answer.probabilities[answer.choice] ?? 0) < MATCHED) return undefined;

  return candidates[optionsFor(candidates).indexOf(answer.choice)];
};

/** Enough for the ranker to recognise the food; more is a wall of synonyms it has to read past. */
const _DICTIONARY_SPELLINGS = 3;

/**
 * What a curated source states the typed term IS — the evidence the ranker was deciding without.
 *
 * By the time this call happens, `resolveIngredient` has already looked the shopper's words up in
 * the Open Food Facts taxonomy, for nothing and with no network. So something frequently knows
 * already that `jus de citron` is lemon juice — and that answer was handed to the row-writing call
 * and once withheld from Jev, which decides whether an existing row is the same food. Judging on
 * the words alone, it linked `jus de citron` to a `Jus d'orange` row, and `oignon vert` to
 * `Oignon`: same form, different fruit, different vegetable.
 *
 * ⚠️ Curated hits only, by `curatedSpellingsIn`, and the reason is sharper here than for storage.
 *    A searched source answers a keyword query with whatever ranked highest — USDA replies to
 *    `pâte de pistache` with a guava pastry — and a wrong name presented to a model as what the
 *    term IS does not merely add noise, it argues for the wrong answer.
 *
 * Empty when nothing curated answered, which is the common case: the ranker then judges on the
 * words alone, and `matchState` leaves the dictionary out rather than sending it empty.
 */
export const dictionaryOf = (hits: readonly LookupHit[]): Dictionary =>
  Object.fromEntries(
    SUPPORTED_LOCALES.flatMap((locale) => {
      const spellings = curatedSpellingsIn(hits, locale).slice(0, _DICTIONARY_SPELLINGS);

      return spellings.length ? [[locale, spellings]] : [];
    }),
  );

/** A result's title in the shopper's language, then the untagged one, then whatever it has. */
const _titleOf = ({ measuredAs }: MeasuredResult, locale: Locale) =>
  (measuredAs.find((title) => title.locale === locale) ??
    measuredAs.find((title) => !title.locale) ??
    measuredAs[0])!.name;

/**
 * A searched hit carrying only the figures of the result that IS the shopper's food, or none.
 *
 * **A keyword search returns a page, and spelling cannot tell which result is the food.** "onion"
 * finds onion rings beside raw onions, "tomates séchées" finds plain tomatoes, and "pesto rouge"
 * found USDA's basil pesto, stamped `foodComposition` on a red one. Its question is its own
 * (`_MEASURED_INSTRUCTIONS`), with `MATCHED` as its floor.
 *
 * Marked `judged` either way, so `measuredAboutIt` does not re-judge it on spelling, and stripped
 * of the page, so the row-writing model is shown one set of figures rather than five.
 *
 * **It does not throw.** When Jev cannot be reached the figures go and the row is still written:
 * the model fills them, as it does any field no source measured. Unlike a missed catalog match,
 * nothing is duplicated by that. A curated hit is returned as it is; its figures were joined to
 * the food by identity, not found by a search.
 */
export const pickMeasuredFood = async (
  asked: Omit<Input<Candidate>, "candidates">,
  searched: LookupHit,
): Promise<LookupHit> => {
  if (!searched.searched || !searched.candidates?.length) return searched;

  const { candidates, ...hit } = searched;

  let picked: MeasuredResult | undefined;
  try {
    const options = candidates.map((result, index) => ({
      id: String(index),
      name: _titleOf(result, asked.locale),
    }));
    const answer = await retryPromise(() => judgeMeasured({ ...asked, candidates: options }), 2);
    const choice = readMatchAnswer(answer, options);
    picked = choice && candidates[Number(choice.id)];
  } catch (error) {
    console.error("pickMeasuredFood could not reach a judgment; the figures are dropped", error);
  }

  // Jev's pick leads each language's spellings, so the row writer reads it as the source's name.
  const isTitle = (spelling: string, locale?: string) =>
    !!picked?.measuredAs.some((title) => title.name === spelling && title.locale === locale);
  const lead = (list: string[] | undefined, locale?: string) =>
    list && [...list].sort((a, b) => Number(isTitle(b, locale)) - Number(isTitle(a, locale)));
  const names = Object.entries(hit.names).map(([locale, list]) => [locale, lead(list, locale)]);
  const untagged = hit.untagged && { untagged: lead(hit.untagged) };

  return { ...hit, ...untagged, names: Object.fromEntries(names), judged: true,
    nutrition: picked?.nutrition, measuredAs: picked?.measuredAs ?? [] };
};

const _choiceAmong = (
  instructions: ChoiceQuestion<string>["instructions"],
  none: string,
  candidates: readonly Candidate[],
): ChoiceQuestion<string> => ({
  type: "choice",
  instructions,
  // `none` first, the candidates after it with no description: their names say what they are,
  // and a description written for each would be this side's opinion of the food, not the food.
  criteria: {
    [NONE]: none,
    ...Object.fromEntries(optionsFor(candidates).map((key) => [key, null])),
  },
});

const _judge =
  (instructions: ChoiceQuestion<string>["instructions"], none: string) =>
  async (input: Input<Candidate>): Promise<ChoiceAnswer<string>> => {
    const question = _choiceAmong(instructions, none, input.candidates);
    const { match } = await askTypeSafe(matchState(input), { match: question }, input.report, input.model);

    return match;
  };

/** The raw judgment, floor not applied — what the manual test measures the floor from. */
export const judgeMatch = _judge(_MATCH_INSTRUCTIONS, _NONE_CRITERION);

/** Which result on a search page measured the food, floor not applied. Measured by its own manual test. */
export const judgeMeasured = _judge(_MEASURED_INSTRUCTIONS, _MEASURED_NONE_CRITERION);

/**
 * Which candidate the shopper meant, or nothing. **Throws** when TypeSafe cannot be reached — the
 * caller retries and then fails the resolution, because "no match" here means "write a new row",
 * and a duplicate row is not a safe fallback for an outage.
 */
export const matchIngredient = async <C extends Candidate>(input: Input<C>) =>
  readMatchAnswer(await judgeMatch(input), input.candidates);

const _aliasQuestion = (matched: string): NoulQuestion => ({
  type: "noul",
  // Short for the reason `_MATCH_INSTRUCTIONS` is: cut ~470 → ~400 tokens a call on 2026-09-24.
  // The brand clause is the one that earns its tokens. Every wording tried without two examples
  // left brands at the floor (`moutarde amora` 0.70–0.81, the original longer text included);
  // this one holds them at 0.84–0.94. `moutarde amora` stays OUT of the examples: it is the
  // manual test's held-out brand, and naming it here would test the word rather than the rule.
  instructions: {
    question: "Is what the shopper typed a correctly spelled name for this food, worth storing?",
    catalogFood: matched,
  },
  criteria: {
    true:
      "Its name in any language, a regional word, a plural, or the food followed by a brand " +
      "(\"ketchup heinz\", \"lait lactel\").",
    false: "A typo (\"échqlote\" for échalote), or more than a name: a quantity, a preparation, a phrase.",
  },
});

/** The raw judgment on the word, floor not applied. */
export const judgeAlias = async (
  input: Omit<Input<Candidate>, "candidates">,
  matched: string,
): Promise<NoulAnswer> => {
  const { alias } = await askTypeSafe(
    matchState(input), { alias: _aliasQuestion(matched) }, input.report, input.model,
  );

  return alias;
};

/**
 * Whether to store the typed word on the row it matched.
 *
 * **It does not throw.** The match is already decided and is worth keeping on its own; a failure
 * here reads as "do not store", which costs one call the next time the word is typed.
 */
export const aliasWorthSaving = async (
  input: Omit<Input<Candidate>, "candidates">,
  matched: string,
): Promise<boolean> => {
  try {
    return (await judgeAlias(input, matched)).noul >= ALIAS_WORTH_SAVING;
  } catch (error) {
    console.error("aliasWorthSaving could not reach a judgment", error);
    return false;
  }
};
