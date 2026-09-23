/**
 * A bake-off: which model should `sanitizeIngredient`'s ROW-WRITING call run on, and at what
 * reasoning effort?
 *
 * ⚠️ THIS COSTS MONEY AND MINUTES — it calls OpenRouter for real, once per entrant per run plus one
 * judge call. Run it by hand, when you are choosing a model:
 *
 *     pnpm test:manual
 *
 * It needs a real `OPENROUTER_API_KEY` in `.env.local` (gitignored — see `.env.example`), because
 * the one the test runner injects is a placeholder. Nothing automatic runs this file: `pnpm test`,
 * `pnpm verify` and the pre-commit hook name their projects explicitly, and `*.manual.test.ts`
 * belongs to the `manual` project alone.
 *
 * **Separate from `sanitizeIngredientRanker.manual.test.ts` because it is a different job.** That
 * one is a classification with a right answer that runs on every unresolved term and wants the
 * cheapest model that is not reckless. This one invents a permanent catalog row out of two words,
 * runs only after the cheap steps have all failed, and wants the best model available. One table
 * cannot pick a winner for both.
 *
 * **What makes this bake-off different from `sanitizeRecipe`'s**: almost nothing here comes from
 * the input. A recipe bake-off measures whether a model transformed what it was given faithfully;
 * this one measures whether what it KNOWS about a food is true, and whether it is willing to say
 * "I checked" only when it did. The four fields nothing can measure — `category`, `diet`,
 * `allergens`, `emoji` — are the whole reason this call exists, and the allergens are the one to
 * watch: a walk that found nothing is read downstream as "somebody considered the fourteen and
 * this carries none", and a screen prints "gluten-free" on the strength of it.
 *
 * **This file's first run is what turned the allergens into a checklist.** Six unrelated models
 * omitted `sulphites` in 13 of 21 completed runs, which is the signature of a specification defect
 * rather than a weak field: `z.array(z.enum(ALLERGENS))` let a model emit two entries without ever
 * visiting the other twelve, and a model with no hidden scratchpad cannot walk fourteen items in
 * silence. The schema now asks all fourteen as keys and `madeFrom` runs ahead of them, which is
 * what a re-run is measuring.
 *
 * What is measured is the REAL thing: `sanitizeIngredientPrompt`, `modelIngredientSchema`,
 * `sanitizeIngredientUserPrompt` and `toSanitizedIngredient` are imported from the tool, so a
 * prompt tuned this afternoon is the prompt scored this evening. What is not shared is `wrapAgent`
 * — the harness calls the provider directly, because a Convex `ToolCtx` and a thread to delete
 * afterwards are not part of the question being asked.
 */
import { describe, expect, it } from "vitest";

import type { LookupHit } from "@convex/functions/ingredients/lookup/lookupHit";

import { runBakeOff, type Candidate } from "../../__bench__";
import { sanitizeIngredientPrompt } from "../../config/prompts/sanitizeIngredient";
import {
  modelIngredientSchema,
  sanitizeIngredientUserPrompt,
  toSanitizedIngredient,
  type SanitizedIngredient,
} from "../sanitizeIngredient";

/* ── The field ─────────────────────────────────────────────────────────────────────────── */

/**
 * The models under test and, for each, the reasoning efforts to try it at. Edit this list — it is
 * the knob this file exists for. A model listed with several modes competes once per mode, blind,
 * and the table subtracts the baseline for you.
 *
 * Weighted towards the expensive end, unlike the ranker's field: this call fires only after the
 * catalog, two shipped datasets and two live APIs have all failed, so it is rare, and what it
 * writes is permanent. `recipesAgent` ships on `gpt-5.6-luna` at medium, which is the incumbent
 * here; the flash entry is there to answer whether the money is buying anything on THIS task
 * rather than to be shipped on a hunch.
 */
const CANDIDATES: Candidate[] = [
  // { name: "openai/gpt-5.6-luna", modes: ["low", "medium"] }, // the incumbent, at two efforts
  // { name: "deepseek/deepseek-v4-flash-0731", modes: [false] },
  // { name: "deepseek/deepseek-v4.1-flash", modes: [false] },
  // { name: "openai/gpt-5.6-luna", modes: [false] },
  { name: "xiaomi/mimo-v2.6-pro", modes: [false] },
  { name: "openai/gpt-6-luna", modes: ["low"] }, // BEST ONE
];

const LOCALE = "fr" as const;

/* ── The ingredient ────────────────────────────────────────────────────────────────────── */

/**
 * What the lookups came back with — the evidence `resolveIngredient` gathered on its way here.
 *
 * Written by hand rather than fetched, so the fixture is stable and the bake-off measures the
 * model rather than whether Open Food Facts was up this afternoon. Every field of it is a trap the
 * prompt names:
 *
 * - **`Sauce Worcestershire` is a database heading, not a shopping word.** The prompt says prefer a
 *   stated name's WORDS and not its punctuation, so the row wants "sauce worcestershire". This was
 *   the fixture's one badly-set trap: the rule used to say "prefer those, verbatim" and licensed an
 *   exception only for a laboratory description, so a model that kept the capital had read it
 *   correctly, and five of eight did. The prompt now says which half of a stated name it means, and
 *   `_catalogName` lowercases regardless — a rule a screen depends on is not left to the model.
 * - **`Lea & Perrins` is `untagged`** — a brand, in no stated language. A name is exactly what it
 *   must not become, and an alias is exactly what it should.
 * - **`sugars` and `carbohydrates` are measured, and deliberately conflict** with what a model
 *   would guess. They must come back untouched: `measuredOver` puts them back over the model's own,
 *   so an entrant "correcting" them changes nothing and an entrant matching them proves nothing.
 * - **`sodium` is deliberately ABSENT from every hit**, so the model's own number is the one that
 *   lands in the row and can be checked. It is the single most-failed field in this schema — see
 *   `CHECKS`.
 */
const HITS: LookupHit[] = [
  {
    source: "foodComposition",
    names: { fr: ["Sauce Worcestershire"] },
    nutrition: { sugars: 22.8, carbohydrates: 26.1 },
  },
  {
    source: "openFoodFacts",
    names: { en: ["worcestershire sauce"] },
    untagged: ["Lea & Perrins Worcester Sauce"],
    nutrition: { calories: 78 },
  },
];

/**
 * Deliberately the hardest ingredient the prompt describes, with most of its traps in one bottle.
 *
 * Worcestershire sauce is a condiment that reads vegetable and is not: it is made with anchovies,
 * so `diet` is `pescatarian` and every model that answers the AISLE rather than the ingredient
 * writes `vegan`. That is the exact failure the `diet` docblock in `shared/diets.ts` was written
 * against ("fish sauce is a CONDIMENT, honey a SWEETENER — every one of them reads as a vegetable
 * to anything that asks the category"), and it is invisible afterwards: nothing downstream can
 * tell a checked `vegan` from a guessed one.
 *
 * It also carries three of the fourteen allergens at once — fish, gluten (barley malt vinegar) and
 * sulphites — where the shape of the mistake is an allergen list that is *plausible* rather than
 * complete, which is the thing an empty-list claim cannot survive.
 *
 * And it is measured in spoonfuls, so `defaultUnit` is a volume and the row is unusable without
 * `gramsPerMl`. That used to be a FAILED RUN — the schema refused the row outright — and this
 * bake-off is what changed it: two of `tencent/hy3`'s three runs died there, throwing away a
 * correct diet and a correct allergen walk over a missing density. `toSanitizedIngredient` now
 * repairs a volume it can (water's 1.0) and refuses only `pcs` with no piece weight, so a density
 * this fixture cares about shows up as a mediocre number in the table rather than as a hole in it.
 */
const INPUT = { locale: LOCALE, text: "sauce worcestershire", hits: HITS } as const;

/* ── Judging ───────────────────────────────────────────────────────────────────────────── */

/**
 * How to rank them, heaviest first — the domain half of the judging.
 *
 * Keyed to `INPUT` above, deliberately: these name the answers this bottle actually has, because a
 * criterion a judge cannot check against the input it was shown is a criterion it grades on vibes.
 * Change `INPUT` and these go stale together with it.
 *
 * Consistency across runs and speed as a tie-break are appended by the harness, which is the one
 * that knows how many runs there were.
 */
const CRITERIA = [
  "Are the claims of ABSENCE true? This is the fault that outranks every other one here, because " +
  "it is the only one nobody can see afterwards. Worcestershire sauce contains anchovies, so the " +
  `diet is "pescatarian" — never "vegan" or "vegetarian", which claim an absence that is false, ` +
  `and never "omnivore" either, which is true of it but not the NARROWEST true label: the diets ` +
  "are ordinal and a recipe takes the widest of its lines, so an ingredient answered one step too " +
  "permissive drags every dish containing it out of reach of the people who could have eaten it. " +
  "Its allergens are fish, gluten " +
  "(barley malt vinegar) and sulphites, so a list missing any of them is worse than a list that " +
  "is merely short. An empty or partial allergen list is read downstream as a completed check — " +
  `a screen prints "gluten-free" on it — so a plausible answer here is a false one.`,
  "Is the nutrition true for the fields nothing measured? Sodium is the one to read first: this " +
  "is per 100g and in MILLIGRAMS, and a real bottle is around 900–1000. A number near 1, 0.98 or " +
  "2.5 is grams, or salt rather than sodium; a number past 2000 is salt read as sodium from the " +
  "other end, or a decimal place out. Both move the Nutri-Score a shopper reads. Then read the " +
  "rest of the column: protein is the one to read, because this bottle is fermented from " +
  "anchovies and carries about 1.3 g of it, so a 0 there is a skipped field rather than a " +
  "measurement. Do NOT mark down a 0 for fat or for fiber — this bottle really does have almost " +
  "no fat and no fibre, so those zeroes are the right answer and an entrant writing them has " +
  "done nothing wrong. The sugars, carbohydrates and calories were supplied as measured and are " +
  "laid back over the answer either way, so they say nothing about an entrant — do not credit or " +
  "blame them.",
  "Are the names what a shop calls it, in BOTH languages? The sources offered " +
  `"Sauce Worcestershire" — a database heading — and "Lea & Perrins Worcester Sauce", which is a ` +
  "brand. A name that carries the brand, or that is a comma-clause description, is wrong. Do NOT " +
  "judge capitalisation: every name is lowercased in code before you see it, so a capital cannot " +
  "reach you and an entrant gets no credit for having avoided one. A row named in one language " +
  "only cannot happen here (the schema refuses it), but a row whose second name is obviously the " +
  "first one echoed untranslated should be marked down.",
  "Are the aliases worth having? The point of them is that somebody typing the other spelling " +
  `finds this row instead of creating a second one — so "worcester", "sauce anglaise" and the ` +
  "brand belong, and a list of near-identical restatements of the name does not. An empty list " +
  "is a weak answer here, given how many words this bottle goes by, but it is not a wrong one.",
  "Is it measured the way a cook writes it? A dash of this is a spoonful, not 100 g, so " +
  `defaultUnit should be "tbsp", "tsp" or "ml" with a defaultQuantity a recipe line would really ` +
  "carry, and a density near 1.1. An entrant that reached for grams to make the arithmetic easy " +
  "has made the line harder to read and no more exact.",
  `Category and emoji: it is a CONDIMENT — not an OIL, not an OTHER, not a SPICE — and the emoji ` +
  "is one character that a shopper would recognise on a list. Two emoji, a letter, or an empty " +
  "string are all failures of the same rule.",
];

/**
 * What code can prove wrong about an answer, without asking a model.
 *
 * Only rules the SCHEMA cannot already enforce are worth a line here. `modelIngredientSchema` plus
 * `toSanitizedIngredient` already guarantee that every vocabulary is in range, that every language
 * has a real name rather than the word for having none, and that the row is weighable in its own
 * unit — re-checking those would report nothing, forever. An entrant that breaks one of them is
 * already a failed run rather than a flagged one.
 *
 * What is left is what this bottle in particular makes checkable: three facts about Worcestershire
 * sauce that are not opinions, and two shapes a name must not have. These are exactly the rules a
 * judge is worst at — it reads fifteen answers and notices the third missing allergen but not the
 * tenth — so they are settled here once and handed to it as findings.
 *
 * Every rule below is exact for THIS fixture. A heuristic that guesses does not belong here: a
 * flag reaches the judge as a fact it is told not to argue with, so a false one is worse than a
 * missing one. That is why nothing checks the calories or the fat — there is a defensible range
 * for both and no line that separates wrong from unusual.
 */
const CHECKS = (sanitized: SanitizedIngredient): string[] => {
  // A refusal is not a badly-shaped row, it is the wrong answer to the question — and the union
  // means it never reaches the fields below, so it has to be its own flag.
  if (sanitized.verdict !== "new")
    return [`answered "${sanitized.verdict}" — this is a condiment a shop sells`];

  const { facts } = sanitized;
  const flags: string[] = [];

  // Anchovies. The whole reason this fixture is Worcestershire sauce and not soy sauce.
  if (facts.diet !== "pescatarian")
    flags.push(`diet "${facts.diet}" — this is made with anchovies, so it is pescatarian`);

  // Not "did it list some allergens" but "did it find the three that are there". Each named
  // separately so a list missing two is two flags, which is what it is.
  const carried = ["fish", "gluten", "sulphites"] as const;

  for (const allergen of carried)
    if (!facts.allergens.includes(allergen))
      flags.push(`allergens omits "${allergen}" — an incomplete list is read as a completed check`);

  // And the other direction, which only became worth checking once the schema started asking all
  // fourteen as explicit keys: forcing a true/false decision per allergen removes the omissions and
  // buys back a few spurious trues — `soybeans` and `celery` are the two this bottle attracts, and
  // it contains neither. A false positive is the safer error of the two and is NOT ranked with an
  // omission, but it is still a wrong answer on a label somebody reads, and nothing else sees it.
  for (const allergen of facts.allergens)
    if (!carried.includes(allergen as (typeof carried)[number]))
      flags.push(`allergens claims "${allergen}" — this bottle carries no such thing`);

  if (facts.category !== "CONDIMENT")
    flags.push(`category "${facts.category}" — a bottled sauce is a CONDIMENT`);

  // Per 100g and in milligrams: a real bottle is near 1000. Anything under 50 is not a debatable
  // estimate, it is the wrong unit — grams, or salt read as sodium — and the Nutri-Score moves.
  if (facts.nutrition.sodium < 50)
    flags.push(`sodium ${facts.nutrition.sodium} is grams or salt, not milligrams of sodium`);

  // And bounded above, because the first run of this bake-off returned 2900 and it reached the
  // judge as a clean row. 2000 mg of sodium per 100 g is 5 g of salt in a 100 g bottle, which no
  // sauce that anybody swallows a spoonful of has ever been — so it is the same class of error as
  // the one below, an answer in the wrong units rather than a defensible estimate, and the bound
  // is exact for THIS fixture in the way this list requires.
  if (facts.nutrition.sodium > 2000)
    flags.push(`sodium ${facts.nutrition.sodium} is salt read as sodium, or a decimal place out`);

  // Protein alone, and NOT the whole column. This started as "protein and fat and fiber all zero"
  // on the theory that a column of zeroes is the shape of a skipped field — but for this bottle
  // fat really is about 0.1 and fibre really is 0, so two thirds of that conjunction were flagging
  // correct answers and the third was carrying it. Protein is the one that is simply wrong: a
  // sauce fermented from anchovies has around 1.3 g of it, and a 0 there moves the Nutri-Score.
  // The conjunction also let "protein 0, fat 0.1" through, which is the same error wearing a
  // decimal.
  if (facts.nutrition.protein === 0)
    flags.push("nutrition gives protein 0 — this is fermented from anchovies and has about 1.3");

  for (const locale of ["fr", "en"] as const) {
    const name = facts.names[locale].value;

    // Casing is NOT checked, and its absence is the finding rather than an oversight:
    // `_catalogName` lowercases every name on the way through, so a check for it here could only
    // ever pass and would read as evidence the field was won. What is left is what a model can
    // still get wrong — a laboratory comma-clause, and the brand the sources handed it.
    if (name.includes(",")) flags.push(`name "${name}" (${locale}) is a description, not a name`);
    if (/lea|perrins/i.test(name)) flags.push(`name "${name}" (${locale}) carries the brand`);
  }

  // "exactly one emoji character … never a letter, never two". Counted in code points, with the
  // zero-width joiner and the variation selector — the two invisible characters that make one
  // emoji several code points — dropped first, and written as escapes because a literal U+200D in
  // a regex is a character no reader can see and no editor reliably preserves.
  const emoji = [...facts.emoji].filter((code) => !/[\u200D\uFE0F]/.test(code));
  if (/[a-z0-9]/i.test(facts.emoji) || emoji.length !== 1)
    flags.push(`emoji "${facts.emoji}" is not a single emoji character`);

  return flags;
};

/* ── The run ───────────────────────────────────────────────────────────────────────────── */

describe("sanitizeIngredient row — model bake-off", () => {
  it("ranks the field", async () => {
    const result = await runBakeOff({
      title: "sanitizeIngredient · row",
      candidates: CANDIDATES,
      system: sanitizeIngredientPrompt(LOCALE),
      prompt: sanitizeIngredientUserPrompt(INPUT),
      // Through the real parser, because "did it produce something the app can store" is half of
      // what is being measured — and here that half has teeth: the weighability rule and the
      // no-shrug-for-a-name rule both live in the parser, so an entrant that breaks either shows
      // up as a failed run rather than as a row somebody has to notice.
      answer: {
        schema: modelIngredientSchema,
        parse: (raw) => toSanitizedIngredient(raw, HITS),
        check: CHECKS,
      },
      provider: { ignore: ["open-inference", "morph", "digitalocean", "baidu"], sort: "price" },
      criteria: CRITERIA,
      runs: 3,
    });

    // The only assertion, and it guards the benchmark rather than the models: an empty table is a
    // broken key or a dead slug, not a result. `clean` is deliberately NOT asserted on — a field
    // where every run is flagged is a finding to read, not a red test.
    expect(result.ok).toBeGreaterThan(0);
  });
});
