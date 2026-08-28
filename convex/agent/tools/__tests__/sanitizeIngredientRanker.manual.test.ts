/**
 * A bake-off: which model should `sanitizeIngredient`'s RANKER call run on, and at what effort?
 *
 * ⚠️ THIS COSTS MONEY AND MINUTES — it calls OpenRouter for real, once per entrant per run plus one
 * judge call, and it does that THREE TIMES (see below). Run it by hand, when you are choosing a
 * model:
 *
 *     pnpm test:manual
 *
 * It needs a real `OPENROUTER_API_KEY` in `.env.local` (gitignored — see `.env.example`), because
 * the one the test runner injects is a placeholder. Nothing automatic runs this file: `pnpm test`,
 * `pnpm verify` and the pre-commit hook name their projects explicitly, and `*.manual.test.ts`
 * belongs to the `manual` project alone.
 *
 * **Its own file, separate from the row bake-off, because it is a different job for a different
 * model.** `sanitizeIngredient` makes two calls: this one asks whether a near-miss the catalog
 * already found is the same food, and the other invents a whole row. The first is a classification
 * with a right answer, runs on every unresolved term, and wants the cheapest model that is not
 * reckless; the second is a generation and wants the best model available. Scoring them in one
 * table would pick one winner for two questions.
 *
 * **Five runs, and all of them matter.** The ranker's failure modes are opposite and a single
 * fixture only measures one:
 *
 * - A MISSED match creates a duplicate row — a second `carotte` that splits every grocery list and
 *   every nutrition total from then on, forever, with no error anywhere.
 * - A WRONG match puts the wrong food on somebody's shopping list, also with no error anywhere.
 *
 * A model that always answers "no match" is perfect on the four refusal fixtures and useless on
 * `PRESENT`; an eager one does the reverse. So ship the model that is clean on ALL FIVE tables,
 * and treat a candidate that wins one of them as unmeasured rather than good.
 *
 * The four refusals are not duplicates of each other, and the differences are what a pass proves.
 * `ABSENT` can be answered correctly by a model that never knew the word — the right answer and
 * ignorance point the same way. The other three cannot: every candidate is a food the shopper
 * plainly meant, so refusing takes a rule rather than a gap, and each names a different rule —
 * `WRONG_FORM` the food transformed, `TOO_SPECIFIC` the food's own category offered back to it,
 * `WRONG_GRADE` two names separated by nothing but a digit.
 *
 * What is measured is the REAL thing: `matchIngredientPrompt`, `matchIngredientUserPrompt`,
 * `matchIngredientSchema` and `MATCHED` are imported from the tool and its prompt module, so a
 * prompt tuned this afternoon is the prompt scored this evening.
 */
import { describe, expect, it } from "vitest";

import { runBakeOff, type Candidate } from "../../__bench__";
import { matchIngredientPrompt } from "../../config/prompts/sanitizeIngredient";
import { parseModelOutput } from "../../utils";
import {
  MATCHED,
  matchIngredientSchema,
  matchIngredientUserPrompt,
  type SanitizeIngredientInput,
} from "../sanitizeIngredient";

/* ── The field ─────────────────────────────────────────────────────────────────────────── */

/**
 * The models under test and, for each, the reasoning efforts to try it at. Edit this list — it is
 * the knob this file exists for.
 *
 * Weighted towards the cheap end on purpose, which is the question this call actually poses: it
  * fires on every term the catalog could not resolve, it reads two lines and answers with two
 * numbers, and if a flash model is clean on both fixtures below there is nothing to buy by
 * spending more. `rankerAgent` ships on the `ranker` tier, which this file chose: `deepseek-v4-flash`
 * with reasoning off is the incumbent and the baseline every other row is read against.
 *
 * Keep a beaten model in the list rather than deleting it. `granite-4.1-8b` and `nex-n2-mini` are
 * both out on the refusal tables, and both still earn their runs: a fixture that only the winner
 * fails is more likely to be a bad fixture than a bad model, and a losing model is the cheapest
 * control there is for telling those two apart.
 */
const CANDIDATES: Candidate[] = [
  { name: "deepseek/deepseek-v4-flash-0731", modes: [false] }, // the incumbent
  { name: "qwen/qwen3.7-flash", modes: [false] },
  // { name: "nex-agi/nex-n2-mini", modes: [false] },
  // { name: "ibm-granite/granite-4.1-8b", modes: [false] },
];

const LOCALE = "fr" as const;

/* ── Fixture one: the match is there, and it is not the closest word ────────────────────── */

/**
 * A shopper on a French device types the word they know. The catalog holds the same bulb — under
 * its English name — and the widened search returned it fourth, below three alliums that look more
 * like the word they typed. That is the ordinary case, not a contrived one: the search ranks on
 * spelling, which is exactly why this call exists.
 *
 * **It replaced a `cilantro` / `coriandre` fixture that every entrant answered perfectly.** That
 * pair is a lexical mapping sitting in every model's training data, so the answer was retrieved
 * rather than reasoned and the distractors were never weighed — 34 runs, 34 correct, nothing
 * ranked. A fixture that no candidate can fail measures the field's floor, not its ceiling.
 *
 * Every distractor is a real failure a spelling-ranked list produces, and one of them is an ACTIVE
 * attractor rather than noise:
 *
 * - `oignon nouveau` is the trap, and it is the prompt's own trap: "spring onion" and "scallion"
 *   are the example it gives of a match, so a model reaching for that rule lands here. Telling
 *   this apart from the rule it resembles is the judgement the call exists to make — a shallot and
 *   a spring onion are different purchases at different prices in different weeks.
 * - `oignon rouge` is the near-miss on taste and aisle, the one a model matching on "small
 *   pungent allium" takes.
 * - `ail` and `ciboulette` are noise the widened search's low floor lets through.
 */
const PRESENT: Pick<SanitizeIngredientInput, "text" | "candidates"> = {
  text: "échalote",
  candidates: [
    { id: "k1", name: "oignon rouge" },
    { id: "k2", name: "oignon nouveau" },
    { id: "k3", name: "ail" },
    { id: "k4", name: "shallot" },
    { id: "k5", name: "ciboulette" },
  ],
};

/** The one right answer, by position. `shallot`. */
const PRESENT_ANSWER = 3;

/* ── Fixture two: nothing here is it ────────────────────────────────────────────────────── */

/**
 * A fruit the catalog genuinely lacks, against four rows whose only claim is that they start with
 * the same letters. The right answer is nothing at all, and the whole cost of getting it right is
 * one generation — the step after this one invents the row.
 *
 * `kaki` is chosen because a persimmon is a real, common fruit rather than a nonsense string: a
 * model that refuses gibberish tells us nothing, since gibberish never reaches this call. What is
 * being measured is whether a model can know a food perfectly well and still decline to file it
 * under a different one.
 */
const ABSENT: Pick<SanitizeIngredientInput, "text" | "candidates"> = {
  text: "kaki",
  candidates: [
    { id: "k1", name: "kiwi" },
    { id: "k2", name: "kale" },
    { id: "k3", name: "cacao" },
    { id: "k4", name: "saké" },
  ],
};

/* ── Fixture three: all of them are the food, and none of them is the product ───────────── */

/**
 * The same refusal as `ABSENT`, asked of a model that cannot get there by not knowing the word.
 *
 * `ABSENT` lets a model refuse for the wrong reason: `kaki` against `kiwi` and `kale` is declined
 * correctly by anything that has never heard of a persimmon, so a pass there is not proof the rule
 * was applied. Here every candidate IS the almond — a model that refuses has to have read
 * "different form of a food where a cook would buy a different product" and acted on it, because
 * ignorance points the other way and every distractor rewards it.
 *
 * It exists because the fixture that used to carry this — `graines de coriandre`, the seeds against
 * the leaves — went out with the `cilantro` list, and nothing replaced it. The bullet it tests
 * guards a silent failure: a cook who asked for `amande` and got `poudre d'amande` has ground
 * almonds in a dish that wanted whole ones, and no error was raised anywhere.
 *
 * `amandes effilées` is the hardest line, and the reason the answer is nothing rather than four:
 * flaked almonds are the same nut, unground, in a bag — the closest any candidate comes — and they
 * are still a different purchase from a bag of whole almonds.
 */
const WRONG_FORM: Pick<SanitizeIngredientInput, "text" | "candidates"> = {
  text: "amande",
  candidates: [
    { id: "k1", name: "poudre d'amande" },
    { id: "k2", name: "lait d'amande" },
    { id: "k3", name: "huile d'amande" },
    { id: "k4", name: "noisette" },
    { id: "k5", name: "amandes effilées" },
  ],
};

/* ── Fixture four: the candidate is the shelf, not the item ─────────────────────────────── */

/**
 * A refusal the `WRONG_FORM` rule does not reach, because nothing here has been transformed.
 *
 * Every candidate is bread and the shopper typed bread, and one of them — `pain blanc` — is a
 * category the typed food genuinely belongs to. The "is a" reads true, which is exactly what makes
 * it dangerous: `pain de mie` IS a white bread, so a model reasoning from taxonomy links it and
 * sounds right doing so. What a shopper handed `pain blanc` brings home is a baguette.
 *
 * It is here because the prompt used to license this in so many words — "a more or less specific
 * word for the same shopping trip: MATCH", with a synonym pair (spring onion / scallion) as its
 * only example. A model reaching for that rule landed on every generic parent in the list, and
 * this was a real link in a real session, not a hypothetical.
 *
 * `pain complet` and `baguette` are the controls: same aisle, plainly not the same purchase, and a
 * model that declines those while linking `pain blanc` is one that has read the hierarchy rule
 * rather than merely refused everything.
 */
const TOO_SPECIFIC: Pick<SanitizeIngredientInput, "text" | "candidates"> = {
  text: "pain de mie",
  candidates: [
    { id: "k1", name: "pain blanc" },
    { id: "k2", name: "pain complet" },
    { id: "k3", name: "baguette" },
    { id: "k4", name: "biscotte" },
    { id: "k5", name: "farine de blé" },
  ],
};

/* ── Fixture five: same words, different number ─────────────────────────────────────────── */

/**
 * The failure a tokenizer cannot see and the model has to catch alone.
 *
 * `searchTerms` drops any token beginning with a digit — it has to, since "200g de pâtes" is
 * pasta — so "5%" is gone before scoring starts and `steak haché 5%` reaches the catalog as
 * `steak hache`. Against a row named `steak haché 20%` that is an EXACT token match, scoring 1,
 * and the ranker is never even called. This fixture measures the case the search widened instead:
 * a differently-worded row, where the model is the only thing standing between a shopper and four
 * times the fat.
 *
 * The number is the whole identity here — 5% mince and 20% mince are 120 kcal apart per 100 g and
 * sit in different fridges at different prices — and it is the one part of the name that carries
 * no word. Refusing takes reading two names that agree on every letter except a digit and calling
 * them different foods, which is the rule the prompt states last and the one a model is likeliest
 * to smooth over.
 *
 * `steak haché` with no grade at all is the second trap and not a match either: an ungraded row is
 * a fifth product, not a wildcard that absorbs the other four.
 */
const WRONG_GRADE: Pick<SanitizeIngredientInput, "text" | "candidates"> = {
  text: "steak haché 5%",
  candidates: [
    { id: "k1", name: "bœuf haché 20%" },
    { id: "k2", name: "steak haché" },
    { id: "k3", name: "steak de bœuf" },
    { id: "k4", name: "saucisse de bœuf" },
    { id: "k5", name: "haché de veau" },
  ],
};

/* ── Judging ───────────────────────────────────────────────────────────────────────────── */

type Match = { matchIndex?: number; confidence?: number };

/**
 * The answer through the tool's own parser, which is half of what is being measured: `matchIndex`
 * and `confidence` are `.nullable().optional()`, so "no match" arrives as a DROPPED KEY rather
 * than as a null, and a model whose answer this throws on has failed the run.
 */
const parse = (count: number) => (raw: unknown): Match =>
  parseModelOutput(matchIngredientSchema(count), raw);

/**
 * What code can prove about a classification, which is nearly all of it.
 *
 * This is the bake-off where the automated half does the real work and the judge is close to
 * decoration: there is one right answer, it is an integer, and a model reading fifteen answers is
 * worse at comparing integers than `===` is. What the judge is left to weigh is the CONFIDENCE —
 * whether a model that got the answer right was sure of it or fell over the line — and the harness
 * gives it these flags as findings rather than asking it to spot them.
 *
 * `MATCHED` is imported rather than written out: the bar this flags against and the bar the tool
 * applies have to be one number.
 */
const CHECKS = (expected: number | undefined) => (answer: Match): string[] => {
  const { matchIndex, confidence } = answer;
  const linked = matchIndex !== undefined && (confidence ?? 0) >= MATCHED;

  const flags: string[] = [];

  if (expected === undefined) {
    // A pick below the bar is not a failure — the tool discards it and invents the row, which is
    // the right outcome. Only a pick the tool would ACT on is wrong here.
    if (linked) flags.push(`linked candidate ${matchIndex} at ${confidence} — nothing here matches`);
  } else if (matchIndex === undefined) {
    flags.push(`answered "no match" — candidate ${expected} is the same food`);
  } else if (matchIndex !== expected) {
    flags.push(`picked candidate ${matchIndex}, not ${expected}`);
  } else if (!linked) {
    flags.push(
      `picked ${expected} correctly but at ${confidence ?? "no confidence"}, below ${MATCHED} — ` +
      "the tool discards this and creates a duplicate row",
    );
  }

  // An INDEX with no confidence is half an answer: the tool reads `confidence ?? 0`, so a real
  // match silently becomes a non-match and the row is duplicated with no error anywhere.
  //
  // A CONFIDENCE with no index is not the mirror of that, and this check used to flag both. It is
  // a refusal that said so out loud — `matchIndex === undefined` short-circuits before the
  // confidence is ever read, so the tool declines correctly — and it was 9 of the 10 correct
  // refusals in the field, from two unrelated models reading "how sure you are" as "not at all".
  // Flagging it marked the right answer wrong on every run that got the fixture right.
  if (matchIndex !== undefined && confidence === undefined)
    flags.push(`matchIndex ${matchIndex} with no confidence — the tool reads this as no match`);

  return flags;
};

const CRITERIA = (expected: number | undefined, list: readonly { name: string }[]) => [
  expected === undefined
    ? "Getting to NO MATCH. None of these candidates is the food that was typed, so the correct " +
    "answer is an empty one. Rank an entrant that linked one of them last, however sensible its " +
    "reasoning sounds: the step after this call invents the row, so declining costs one " +
    "generation, and linking wrongly puts a different food on somebody's shopping list with no " +
    "error anywhere. An entrant that named a candidate but kept its confidence below " +
    `${MATCHED} is better than one that was sure, and worse than one that named nothing.`
    : `Getting to candidate ${expected} ("${list[expected]?.name}"), which is the same food under ` +
    "its other language's name. This is the whole task — an entrant that missed it is ranked " +
    "below every entrant that found it, whatever else it did well, because a missed match " +
    "creates a duplicate catalog row that splits every list and total from then on.",
  "Was the confidence honest? A right answer at 0.55 and a right answer at 0.95 are not the same " +
  `answer: the tool acts only at ${MATCHED}, so the first one is discarded and the second is used. ` +
  "Equally, a wrong answer held below the bar is a model behaving well under uncertainty. Read " +
  "the number as a decision, not as decoration.",
  "Did it stay inside the list? An index outside the candidates, or an answer carrying a name, a " +
  "row id or an explanation instead of a position, is a model that did not do the task it was " +
  "given — the schema is the contract and there is nothing to interpret.",
];

/* ── The runs ──────────────────────────────────────────────────────────────────────────── */

const bakeOff = (
  title: string,
  input: Pick<SanitizeIngredientInput, "text" | "candidates">,
  expected: number | undefined,
) =>
  runBakeOff({
    title,
    candidates: CANDIDATES,
    system: matchIngredientPrompt(LOCALE),
    prompt: matchIngredientUserPrompt(input),
    answer: {
      schema: matchIngredientSchema(input.candidates?.length ?? 0),
      parse: parse(input.candidates?.length ?? 0),
      check: CHECKS(expected),
    },
    provider: { ignore: ["open-inference", "morph", "digitalocean", "baidu"], sort: "price" },
    criteria: CRITERIA(expected, input.candidates ?? []),
    // More than the row bake-off's three, and affordable here: this call is two lines in and two
    // numbers out, and what is being measured is partly VARIANCE — a model that links the wrong
    // row one time in five is a model that cannot ship, and three runs can miss that.
    runs: 5,
  });

describe("sanitizeIngredient ranker — model bake-off", () => {
  it("ranks the field on a term the catalog already holds", async () => {
    const result = await bakeOff("sanitizeIngredient · ranker · match present", PRESENT, PRESENT_ANSWER);

    // The only assertion, and it guards the benchmark rather than the models: an empty table is a
    // broken key or a dead slug, not a result. `clean` is deliberately NOT asserted on — a field
    // where every run is flagged is a finding to read, not a red test.
    expect(result.ok).toBeGreaterThan(0);
  });

  it("ranks the field on a term nothing in the list matches", async () => {
    const result = await bakeOff("sanitizeIngredient · ranker · no match", ABSENT, undefined);

    expect(result.ok).toBeGreaterThan(0);
  });

  it("ranks the field on a term every candidate is the wrong form of", async () => {
    const result = await bakeOff("sanitizeIngredient · ranker · wrong form", WRONG_FORM, undefined);

    expect(result.ok).toBeGreaterThan(0);
  });

  it("ranks the field on a term one candidate is the category of", async () => {
    const result = await bakeOff(
      "sanitizeIngredient · ranker · too specific",
      TOO_SPECIFIC,
      undefined,
    );

    expect(result.ok).toBeGreaterThan(0);
  });

  it("ranks the field on a term that differs from a candidate only by its number", async () => {
    const result = await bakeOff(
      "sanitizeIngredient · ranker · wrong grade",
      WRONG_GRADE,
      undefined,
    );

    expect(result.ok).toBeGreaterThan(0);
  });
});
