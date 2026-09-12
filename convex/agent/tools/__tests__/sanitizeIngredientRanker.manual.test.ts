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
 * **Nine tables, and all of them matter.** The ranker's failure modes are opposite and a single
 * fixture only measures one:
 *
 * - A MISSED match creates a duplicate row — a second `carotte` that splits every grocery list and
 *   every nutrition total from then on, forever, with no error anywhere.
 * - A WRONG match puts the wrong food on somebody's shopping list, also with no error anywhere.
 *
 * A model that always answers "no match" is perfect on the six refusal fixtures and useless on
 * `PRESENT`; an eager one does the reverse. So ship the model that is clean on ALL NINE tables,
 * and treat a candidate that wins one of them as unmeasured rather than good.
 *
 * **`MANGLED` measures the second question this call now answers**, and it is a different one: not
 * "is this the same food" but "is what they typed a WORD" — the judgement that decides whether the
 * match is written onto the row and never paid for again. It shares `PRESENT`'s candidate list so
 * that a model failing it has failed at exactly that and not at the match.
 *
 * The six refusals are not duplicates of each other, and the differences are what a pass proves.
 * `ABSENT` can be answered correctly by a model that never knew the word — the right answer and
 * ignorance point the same way. The other five cannot: every candidate is a food the shopper
 * plainly meant, so refusing takes a rule rather than a gap, and each names a different rule —
 * `WRONG_FORM` the food transformed, `TOO_SPECIFIC` the food's own category offered back to it,
 * `WRONG_GRADE` two names separated by nothing but a digit, `WRONG_FRUIT` a dictionary line the
 * model has to weigh above the spelling, `BRAND_VARIETY` a brand that names a maker and not a
 * food.
 *
 * `BRAND` and `BRAND_VARIETY` are a PAIR and neither is worth reading alone — one is the match a
 * brand earns, the other the match it does not, on the same candidates. A model clean on both has
 * read the rule; a model clean on one has found the answer the shortcut also reaches.
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
  // { name: "deepseek/deepseek-v4-flash-0731", modes: [false] }, // the incumbent
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

/* ── Fixture six: the right row, under a word not worth keeping ─────────────────────────── */

/**
 * The same match as `PRESENT`, reached through a word that must NOT be written down.
 *
 * `saveAlias` is what stops this call being paid for twice: a word the ranker vouches for is
 * stored on the row it matched, and step 1 answers it for nothing from then on. Which makes the
 * field's dangerous answer `true`, not `false` — a wrong `false` costs one more model call the next
 * time somebody types the word, and a wrong `true` indexes a catalog row under a keyboard slip
 * permanently, where it competes for every future search.
 *
 * So the fixture is a MANGLING and not a misspelling, and the difference is the whole test. The
 * prompt keeps "the misspelling everybody makes" — `échalotte` with two t's is a word people type,
 * and storing it is the feature working. `échqlote` is a thumb on the key beside the `a`: nobody
 * will ever produce that string a second time, so the row gains nothing and the index gains noise.
 *
 * It is deliberately the same candidate list as `PRESENT`, so a model that scores well there and
 * badly here has failed at exactly one thing — telling a word from a slip — rather than at the
 * match. An entrant that answers "no match" fails this fixture too: the shopper still meant a
 * shallot, and refusing costs them a duplicate row.
 */
const MANGLED: Pick<SanitizeIngredientInput, "text" | "candidates"> = {
  ...PRESENT,
  text: "échqlote",
};

/* ── Fixture seven: the form is shared and the food is not ──────────────────────────────── */

/**
 * The link this slice was reported for, with the evidence the ranker used to be denied.
 *
 * A recipe imported from a Russian page listed `jus de citron`; the catalog held no lemon juice and
 * the widened search offered `Jus d'orange` at 0.35. The ranker linked them, twice — a re-save
 * bought the same wrong answer — and the cook's recipe read "jus d'orange" with no error anywhere.
 *
 * What makes it a fair test of the fix rather than of the model is `hits`: the OFF taxonomy files
 * `jus de citron` under `en:lemon-juice`, that lookup runs for free BEFORE this call, and its
 * answer is now in the prompt. An entrant that still links the orange has read "a food dictionary
 * says this is lemon juice" and linked it to orange juice anyway.
 *
 * `citron` is the control and the harder half of the refusal: it is the right FRUIT and still the
 * wrong purchase — a bag of lemons is not a bottle of juice — so an entrant that grabs it has
 * matched on the word rather than on the food.
 */
const WRONG_FRUIT: Pick<SanitizeIngredientInput, "text" | "candidates" | "hits"> = {
  text: "jus de citron",
  candidates: [
    { id: "k1", name: "Jus d'orange" },
    { id: "k2", name: "Citron" },
    { id: "k3", name: "Citron vert" },
    { id: "k4", name: "Jus de pomme" },
    { id: "k5", name: "Vinaigre blanc" },
  ],
  hits: [
    {
      source: "foodComposition",
      names: { en: ["lemon juice"], fr: ["jus de citron"] },
      nutrition: { calories: 23 },
    },
  ],
};

/* ── Fixture eight: the brand IS the food ───────────────────────────────────────────────── */

/**
 * The match the refusals must not cost, and the reason this call is a model rather than a rule.
 *
 * Every fixture above rewards caution, and a model that has learnt to refuse everything passes all
 * of them. This one only passes if the model can still strike a maker's name and see the food
 * underneath: what is left of "ketchup heinz" is "ketchup", and the catalog holds that row. No
 * dictionary answers here — the taxonomy has no `ketchup heinz` entry — which is exactly the case
 * the deterministic checks around this call cannot reach, and why the judgement is bought at all.
 *
 * **It used to be `chocolat milka` against three chocolate varieties, and that fixture was
 * unanswerable.** Striking the brand leaves "chocolat", which named no candidate: the list offered
 * a milk, a dark and a white, so choosing one took knowing that Milka's range is milk-only. That
 * is brand-portfolio trivia, not a shopping judgement, and the winner passing it was the winner
 * knowing one fact about one maker. A fixture whose answer cannot be reached from the candidate
 * list measures the model's memory, not the rule.
 *
 * So the brand here is struck to a name the catalog holds VERBATIM, and the varieties move to
 * `BRAND_VARIETY` where the refusal they force is the whole point. `sauce tomate` is the near-miss
 * — ketchup is a tomato sauce and is not that shelf's row — and `sauce barbecue` the bottled
 * neighbour a spelling-ranked search offers.
 *
 * `saveAlias` is true: a brand people shop by is a word the next shopper will type.
 */
const BRAND: Pick<SanitizeIngredientInput, "text" | "candidates"> = {
  text: "ketchup heinz",
  candidates: [
    { id: "k1", name: "sauce tomate" },
    { id: "k2", name: "ketchup" },
    { id: "k3", name: "sauce barbecue" },
    { id: "k4", name: "moutarde" },
    { id: "k5", name: "concentré de tomates" },
  ],
};

/** The one right answer, by position. `ketchup`. */
const BRAND_ANSWER = 1;

/* ── Fixture nine: the brand, and it does not say which food ────────────────────────────── */

/**
 * `BRAND`'s control, and the reason that fixture cannot be read alone.
 *
 * A model that answers `BRAND` correctly has done one of two things, and one table cannot tell
 * them apart: struck the maker's name and found what was left in the list, or learnt that a brand
 * beside a food means "link the likeliest row". Both reach `ketchup`. Only the first refuses here.
 *
 * Strike "lindt" and what is left is "chocolat", which names no candidate: the list splits that
 * shelf into a milk, a dark and a white, and the shopper said which of them nowhere. So the right
 * answer is nothing at all — the step after invents the row, and a shopper handed `chocolat au
 * lait` for a bar of Lindt 85% has the wrong food with no error anywhere.
 *
 * **What makes it a fair test is that the refusal is reachable from the LIST.** An earlier version
 * of this pair asked the opposite — match `chocolat milka` to `chocolat au lait`, refuse `chocolat
 * lindt` on the same candidates — and every entrant linked both, because the only thing separating
 * them was which maker's product range the model happened to remember. Two unrelated models linked
 * candidate 0 on 7 of 10 runs, which is a badly specified rule and not a weak field. The rule now
 * reads the candidates instead of the maker, and the two tables differ by something the model can
 * actually see: whether striking the brand leaves a name the list holds.
 */
const BRAND_VARIETY: Pick<SanitizeIngredientInput, "text" | "candidates"> = {
  text: "chocolat lindt",
  candidates: [
    { id: "k1", name: "chocolat au lait" },
    { id: "k2", name: "chocolat noir 70%" },
    { id: "k3", name: "chocolat blanc" },
    { id: "k4", name: "cacao en poudre" },
    { id: "k5", name: "pâte à tartiner" },
  ],
};

/* ── Judging ───────────────────────────────────────────────────────────────────────────── */

type Match = { matchIndex?: number; confidence?: number; saveAlias?: boolean };

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
const CHECKS = (expected: number | undefined, keeps?: boolean) => (answer: Match): string[] => {
  const { matchIndex, confidence, saveAlias } = answer;
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

  // Only where a match was expected, and only where the fixture states an answer. On the four
  // refusal fixtures there is no row to remember a word on, so whatever the model wrote here is
  // never read — flagging it would mark a correct refusal wrong, which is the mistake the
  // confidence check above already made once.
  //
  // Asymmetric on purpose, because the two errors do not cost the same. A missing or false
  // `saveAlias` on a word worth keeping costs one model call the next time it is typed, so it is a
  // finding to read. A `true` on a mangling is permanent: the row is indexed under a string nobody
  // will type twice, and it competes for every search from then on. The tool reads `=== true`, so
  // absent is scored as false rather than as a separate answer.
  if (expected !== undefined && keeps !== undefined && linked && (saveAlias === true) !== keeps)
    flags.push(
      keeps
        ? `saveAlias ${saveAlias ?? "absent"} — this word is worth storing, and the next shopper ` +
        "who types it pays for this call again"
        : `saveAlias true — this is a slip, not a word, and storing it indexes the row under a ` +
        "string nobody will type twice",
    );

  return flags;
};

const CRITERIA = (
  expected: number | undefined,
  list: readonly { name: string }[],
  keeps?: boolean,
) => [
    expected === undefined
      ? "Getting to NO MATCH. None of these candidates is the food that was typed, so the correct " +
      "answer is an empty one. Rank an entrant that linked one of them last, however sensible its " +
      "reasoning sounds: the step after this call invents the row, so declining costs one " +
      "generation, and linking wrongly puts a different food on somebody's shopping list with no " +
      "error anywhere. An entrant that named a candidate but kept its confidence below " +
      `${MATCHED} is better than one that was sure, and worse than one that named nothing. ` +
      "Ignore saveAlias entirely on this table, whichever way it was answered: there is no row to " +
      "remember a word on, the tool stops reading at the missing index and never looks at the " +
      "field, so an entrant that sent it is not worse than one that omitted it. Ranking on it " +
      "decides the table on a value nothing reads."
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
    ...(keeps === undefined
      ? []
      : [
        `Did it judge the WORD as well as the food? saveAlias should be ${keeps} here. The word the ` +
        "shopper typed is stored on the row when this is true, which is what stops the next shopper " +
        "who types it paying for this same call — so a needless false is a real cost. But it is the " +
        "cheaper mistake by a long way: a word stored wrongly is indexed forever and competes for " +
        "every future search, while a word not stored costs one call. Rank an entrant that got the " +
        "match right and this wrong below one that got both, and an entrant that stored a mangling " +
        "below one that stored nothing.",
      ]),
  ];

/* ── The runs ──────────────────────────────────────────────────────────────────────────── */

const bakeOff = (
  title: string,
  input: Pick<SanitizeIngredientInput, "text" | "candidates" | "hits">,
  expected: number | undefined,
  /** What `saveAlias` should be, where the fixture has an opinion. Undefined = not scored. */
  keeps?: boolean,
) =>
  runBakeOff({
    title,
    candidates: CANDIDATES,
    system: matchIngredientPrompt(LOCALE),
    prompt: matchIngredientUserPrompt(input),
    answer: {
      schema: matchIngredientSchema(input.candidates?.length ?? 0),
      parse: parse(input.candidates?.length ?? 0),
      check: CHECKS(expected, keeps),
    },
    provider: { ignore: ["open-inference", "morph", "digitalocean", "baidu"], sort: "price" },
    criteria: CRITERIA(expected, input.candidates ?? [], keeps),
    // More than the row bake-off's three, and affordable here: this call is two lines in and two
    // numbers out, and what is being measured is partly VARIANCE — a model that links the wrong
    // row one time in five is a model that cannot ship, and three runs can miss that.
    runs: 5,
  });

describe("sanitizeIngredient ranker — model bake-off", () => {
  it("ranks the field on a term the catalog already holds", async () => {
    // `échalote` is the French word for the food, on a row named in English — the case `saveAlias`
    // exists for. Stored, the next French shopper reaches `shallot` through step 1 for nothing.
    const result = await bakeOff(
      "sanitizeIngredient · ranker · match present",
      PRESENT,
      PRESENT_ANSWER,
      true,
    );

    // The only assertion, and it guards the benchmark rather than the models: an empty table is a
    // broken key or a dead slug, not a result. `clean` is deliberately NOT asserted on — a field
    // where every run is flagged is a finding to read, not a red test.
    expect(result.ok).toBeGreaterThan(0);
  });

  it("ranks the field on the right row reached through a word not worth keeping", async () => {
    const result = await bakeOff(
      "sanitizeIngredient · ranker · mangled spelling",
      MANGLED,
      PRESENT_ANSWER,
      false,
    );

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

  it("ranks the field on a term a dictionary has already identified", async () => {
    const result = await bakeOff(
      "sanitizeIngredient · ranker · wrong fruit",
      WRONG_FRUIT,
      undefined,
    );

    expect(result.ok).toBeGreaterThan(0);
  });

  it("ranks the field on a brand the catalog holds under its plain name", async () => {
    const result = await bakeOff(
      "sanitizeIngredient · ranker · brand",
      BRAND,
      BRAND_ANSWER,
      true,
    );

    expect(result.ok).toBeGreaterThan(0);
  });

  it("ranks the field on a brand that does not say which of the candidates it is", async () => {
    const result = await bakeOff(
      "sanitizeIngredient · ranker · brand variety",
      BRAND_VARIETY,
      undefined,
    );

    expect(result.ok).toBeGreaterThan(0);
  });
});
