/**
 * A bake-off: which model should `sanitizeRecipe` actually run on, and at what reasoning effort?
 *
 * ⚠️ THIS COSTS MONEY AND MINUTES — it calls OpenRouter for real, once per entrant per run plus one
 * judge call. Run it by hand, when you are choosing a model:
 *
 *     pnpm test:manual
 *
 * It needs a real `OPENROUTER_API_KEY` in `.env.local` (gitignored — see `.env.example`), because
 * the one the test runner injects is a placeholder. Nothing automatic runs this file: `pnpm test`,
 * `pnpm test:watch`, `pnpm verify` and the pre-commit hook name their three projects explicitly,
 * and `*.manual.test.ts` belongs to the `manual` project alone.
 *
 * The machinery — blind labelling, the concurrency cap, cost accounting, the judge, the table —
 * lives in `convex/agent/__bench__` and is shared with every other bake-off. What is in THIS file
 * is only what is about recipes: the field, the input, and how to rank the answers.
 *
 * What is measured is the REAL thing, not a copy of it: `modelRecipeSchema`, `toSanitizedRecipe`
 * and `sanitizeRecipePrompt` are imported from the tool, so a prompt you tune this afternoon is
 * the prompt scored this evening. What is not shared is `wrapAgent` — the harness calls the
 * provider directly, because a Convex `ToolCtx` and a thread to delete afterwards are not part of
 * the question being asked.
 *
 * There is one assertion, and it is not the point. The output is two things: a table in the
 * terminal, and a markdown file under `convex/agent/__bench__/runs/` (gitignored) whose path the
 * run prints last. The table answers which model to ship; the FILE is what you hand to another
 * model when no candidate is good enough — it carries the system prompt, the input, every answer,
 * every automated flag and the judge's notes together, which is what it takes to tell a bad field
 * of models apart from a prompt or a schema that was asking for the wrong thing.
 */
import { describe, expect, it } from "vitest";

import { runBakeOff, type Candidate } from "../../__bench__";
import { modelRecipeSchema, toSanitizedRecipe, type SanitizedRecipe } from "../sanitizeRecipe";
import { sanitizeRecipePrompt } from "../../config/prompts/sanitizeRecipe";

/* ── The field ─────────────────────────────────────────────────────────────────────────── */

/**
 * The models under test and, for each, the reasoning efforts to try it at. Edit this list — it is
 * the knob this file exists for. A model listed with several modes competes once per mode, blind,
 * and the table subtracts the baseline for you.
 *
 * A mode is `false` for reasoning off, one of OpenRouter's three levels, or a NUMBER — a token
 * budget, sent as `reasoning.max_tokens`. The number is what makes two different models comparable:
 * one vendor's "high" can be four times another's.
 */
const CANDIDATES: Candidate[] = [
  // { name: "deepseek/deepseek-v4-flash-0731", modes: [false] },
  // { name: "tencent/hy3", modes: ["low"] },
  // { name: "google/gemini-3.7-flash", modes: ["low"] },
  { name: "openai/gpt-5.6-luna", modes: ["medium"] }, // BEST ONE !
  // { name: "z-ai/glm-5.3-flash", modes: ["high", "max"] },
];

/* ── The recipe ────────────────────────────────────────────────────────────────────────── */

const LOCALE = "fr" as const;

//  Deliberately the hardest input the prompt describes, with every trap it names in one dish:
const INPUT = {
  locale: LOCALE,
  ingredients: [
    "1,3 kg d'épaule de porc désossée (ou 3 lb, c'est ce que le boucher me vend)",
    "3 c. à soupe de gochujang + 1 c. à soupe de plus pour la sauce",
    "un filet d'huile de sésame grillé",
    "2 gousses d'ail écrasées",
    "de la sauce soja (japonaise, pas chinoise)",
    "1 poire nashi râpée — indispensable, ne sautez pas ça",
    "2 c. à c. de sucre roux, enfin à peu près",
    "sel, poivre",
    "1 cup de vinaigre de riz",
    "1 concombre",
    "2 oignons nouveaux",
    "1 bouquet de coriandre fraîche",
    "4 c. à soupe de mayonnaise japonaise Kewpie",
    "1 citron vert",
    "de la sriracha si vous aimez ça",
    "1 c. à soupe de Maïzena",
    "12 petites tortillas de maïs (ou 8 grandes si vous avez faim)",
    "des graines de sésame pour la déco"
  ],
  instructions: `Alors d'abord la sauce parce que c'est le plus simple : mayo Kewpie, la cuillère de gochujang qui
reste, le jus du citron vert, un peu de sriracha. Je mixe au blender mais franchement un fouet
suffit. Au frigo jusqu'au service. Ma grand-mère disait toujours qu'une sauce se repose.

Ah oui, important : la veille. Vous mélangez le gochujang, la poire râpée, l'ail, le sucre, un bon
trait de sauce soja, le filet d'huile de sésame, sel poivre, vous massez l'épaule avec ça et hop au
frigo toute la nuit (12h, moi je fais souvent plus). Sortez la viande 1h avant, sinon elle est
glacée à coeur.

Le lendemain, faites bien colorer la viande sur toutes les faces dans une cocotte avec un peu
d'huile neutre, 10 minutes environ, c'est là que tout le goût se fait. Vous jetez tout dans la
mijoteuse avec une feuille de laurier et un morceau de gingembre frais râpé, 6 heures en position
basse. Pas de mijoteuse ? Four à 300°F, même durée, cocotte couverte.

Pendant que ça cuit vous faites les pickles : concombre en fines rondelles, le vinaigre de riz, une
pincée de sel, une cuillère de sucre, et ça repose 30 minutes minimum au frais. Ciselez les oignons
nouveaux et la coriandre là aussi, ça vous fera ça de moins à faire.

Quand c'est prêt la viande s'effiloche à la fourchette toute seule. Effilochez, remettez dans le jus
de cuisson.

Réchauffez les tortillas 30 secondes par face dans une poêle sèche (5 minutes pour tout le monde),
pendant que vous sortez la sauce. Vous montez : viande, pickles bien égouttés, sauce, oignons
nouveaux, coriandre, sésame.

Chez nous ça fait 6 tacos par personne pour 4, enfin on était 6 la dernière fois et il en restait.`,
} as const;

/** The same shape `tools/sanitizeRecipe.ts` builds. Kept in step with it by hand — it is 2 lines. */
const USER_PROMPT =
  `Ingredients, as the cook wrote them:\n${INPUT.ingredients.join("\n")}\n\n` +
  `Instructions, as the cook wrote them:\n${INPUT.instructions}`;

/**
 * How to rank them, heaviest first — the domain half of the judging.
 *
 * Keyed to `INPUT` above, deliberately: these name the answers that dish actually has, because a
 * criterion a judge cannot check against the input it was shown is a criterion it grades on vibes.
 * Each one below is a failure observed in a real run of this recipe, not a rule invented here — a
 * model that invented star anise, one that wrote `quantity: 0` rather than drop an unused
 * ingredient, one that tagged six hours of pork "quick". Change `INPUT` and these go stale
 * together with it.
 *
 * Consistency across runs and speed as a tie-break are appended by the harness, which is the one
 * that knows how many runs there were.
 */
const CRITERIA = [
  "Did it invent anything? The paragraph is the whole of what exists: a technique nobody " +
  "described, an ingredient nobody wrote (a star anise), a thickening step added to justify " +
  "the Maïzena, a quantity the cook never gave turned into a step. This outranks every other " +
  "fault here, because everything else is a recipe that reads a little wrong and this one is a " +
  "recipe that is not theirs.",
  "Would a cook get this dish right by following it, start to finish, once?",
  `Is every quantity a number they can act on? No 0, no "to taste" left standing, no ingredient ` +
  `listed twice under two names ("brown sugar" and "sugar" are one line), and no unit the ` +
  `catalog cannot weigh — "1 cup" and "1 bouquet" become 25 cl and 30 g, never "1 pcs", which ` +
  "means a countable thing and nothing else. The 3 lb is the same 1,3 kg, counted once.",
  "Is the shopping list complete and honest? The bay leaf, the ginger and the neutral oil exist " +
  "only inside the paragraph and still have to be bought. The Maïzena no step uses may be kept " +
  "or dropped, but a step invented to use it is the first fault above, not this one.",
  `Tags: a true one left out is the same error as a false one written. This dish IS "spicy" ` +
  `(gochujang and sriracha) and IS "make-ahead" (it marinates overnight). It is not "quick" at ` +
  `six hours, not "one-pot" across three vessels, not "pasta" and not "bowl" — those name what ` +
  `is on the plate, and it is a taco. Nor is it "pastry": that is the pâtisserie counter, and ` +
  "neither a tortilla nor a cocotte that may spend six hours in the oven makes anything of the kind. " +
  "Diet is computed from the ingredients elsewhere, so no diet tag is available to write and " +
  "none should be missed.",
  "Equipment: the mijoteuse and the four are two ways of doing the one thing the recipe cannot " +
  "skip, so a cook needs either and both belong. The blender does not — the cook says a whisk " +
  "does the job, and an appliance offered alongside a hand tool is a convenience, not a " +
  "requirement. A pan, a cocotte and a fork are never equipment.",
  "Timings as the cook lives them, not as the steps sum: resting is the 12 h night plus the hour " +
  "the meat comes back to temperature, cooking is the 6 h plus the 10 min sear plus the 5 min " +
  "of tortillas, and the pickles made while the pork cooks are counted nowhere at all.",
  "Names and shape, which is what the catalog and the reader each get matched against: singular, " +
  `no brand, and no comma clause — "coriander", never "coriander, fresh" or "Kewpie". A step ` +
  `calls an ingredient by the name the list gives it, so a list saying "scallions" and a step ` +
  `saying "spring onions" is a shopping list the cook cannot follow. Groups are named for a ` +
  `component or a moment, and a title joined by "and" is two groups that were not split. The ` +
  "title names only what the recipe actually makes: there is no nashi pear slaw, sauce or " +
  "pickle in this dish — the pear goes into the marinade.",
];


/**
 * What code can prove wrong about an answer, without asking a model.
 *
 * Only rules the SCHEMA cannot already enforce are worth a line here. `modelRecipeSchema` plus
 * `toSanitizedRecipe` already guarantee that every quantity is a number, every unit is in `UNITS`
 * and every timing is positive-or-absent — re-checking those would report nothing, forever.
 *
 * What is left is the prompt's prose rules, which no schema can hold: a bare lowercase ingredient
 * name, no ingredient listed twice, no step wearing the numbering the group already gives it.
 * These are the rules a judge is worst at — it reads fifteen answers and notices the third
 * violation but not the tenth — so they are settled here and handed to it as findings.
 *
 * Every rule below is exact. A heuristic that guesses (does any step MENTION this ingredient?)
 * does not belong here: a flag reaches the judge as a fact it is told not to argue with, so a
 * false one is worse than a missing one.
 */
const CHECKS = (recipe: SanitizedRecipe) => {
  const names = recipe.ingredients.map(({ name }) => name);
  const steps = recipe.instructions.flatMap((group) => group.steps);

  return [
    // "The ingredient alone, singular, lowercase, with no quantity, brand or preparation."
    ...names
      .filter((name) => name !== name.toLowerCase() || /\d/.test(name) || name.includes(","))
      .map((name) => `ingredient "${name}" is not a bare lowercase name`),

    // "One entry per ingredient, never the same ingredient twice — quantities added together."
    ...[...new Set(names.filter((name, index) => names.indexOf(name) !== index))].map(
      (name) => `ingredient "${name}" is listed twice`,
    ),

    // "with no leading number, dash or bullet"
    ...steps
      .filter((step) => /^\s*(\d+\s*[.)]|[-–—*•])/.test(step))
      .map((step) => `step is numbered or bulleted: "${step.slice(0, 40)}…"`),

    // A group with no steps is a heading the cook cannot follow.
    ...recipe.instructions
      .filter((group) => !group.steps.length)
      .map((group) => `instruction group "${group.title ?? "untitled"}" has no steps`),
  ];
};

/* ── The run ───────────────────────────────────────────────────────────────────────────── */

describe("sanitizeRecipe — model bake-off", () => {
  it("ranks the field", async () => {
    const result = await runBakeOff({
      title: "sanitizeRecipe",
      candidates: CANDIDATES,
      system: sanitizeRecipePrompt(LOCALE),
      prompt: USER_PROMPT,
      // Through the real parser, because "did it produce something the app can store" is half of
      // what is being measured. A model whose answer `toSanitizedRecipe` throws on has failed the
      // run, however good the prose was.
      answer: { schema: modelRecipeSchema, parse: toSanitizedRecipe, check: CHECKS },
      provider: {
        ignore: ["open-inference", "morph", "digitalocean", "baidu"],
        sort: "price"
      },
      criteria: CRITERIA,
      runs: 3,
    });

    // The only assertion, and it guards the benchmark rather than the models: an empty table is a
    // broken key or a dead slug, not a result. `clean` is deliberately NOT asserted on — a field
    // where every run is flagged is a finding to read, not a red test.
    expect(result.ok).toBeGreaterThan(0);
  });
});
