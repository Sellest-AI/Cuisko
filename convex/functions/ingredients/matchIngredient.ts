import {
  askTypeSafe,
  type ChoiceAnswer,
  type ChoiceQuestion,
  type NoulAnswer,
  type NoulQuestion,
} from "@convex/lib/typesafe/ask";
import { LANGUAGE_NAMES, SUPPORTED_LOCALES, type Locale } from "@shared/translations";

/**
 * Is one of the near-misses the catalog search found the SAME FOOD the shopper typed, and if so, is
 * what they typed worth storing on that row?
 *
 * Step 4 of `resolveIngredient`, first half: `sanitizeIngredient` asks this before paying for a row.
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
    "A number in a name is a grade: steak haché 5% is neither steak haché 20% nor steak haché.",
    "A brand never picks a kind: \"chocolat lindt\" against milk, dark and white chocolate is none.",
    "A foodDictionary, when given, says what the shopper's words mean.",
  ],
};

const _NONE_CRITERION =
  "No option is that exact food. A different food sharing a word, a different form or kind of " +
  "the same product, a broader shelf, or a choice between kinds the shopper did not make is not a " +
  "match.";

/** The pick → the candidate to link, or nothing. Pure, so what we DO with a 0.7 is unit-tested. */
export const readMatchAnswer = <C extends Candidate>(
  answer: ChoiceAnswer<string>,
  candidates: readonly C[],
): C | undefined => {
  if (answer.choice === NONE) return undefined;
  if ((answer.probabilities[answer.choice] ?? 0) < MATCHED) return undefined;

  return candidates[optionsFor(candidates).indexOf(answer.choice)];
};

/** The raw judgment, floor not applied — what the manual test measures the floor from. */
export const judgeMatch = async (input: Input<Candidate>): Promise<ChoiceAnswer<string>> => {
  const question: ChoiceQuestion<string> = {
    type: "choice",
    instructions: _MATCH_INSTRUCTIONS,
    // `none` first, the candidates after it with no description: their names say what they are,
    // and a description written for each would be this side's opinion of the food, not the food.
    criteria: {
      [NONE]: _NONE_CRITERION,
      ...Object.fromEntries(optionsFor(input.candidates).map((key) => [key, null])),
    },
  };

  const { match } = await askTypeSafe(matchState(input), { match: question });

  return match;
};

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
  const { alias } = await askTypeSafe(matchState(input), { alias: _aliasQuestion(matched) });

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
