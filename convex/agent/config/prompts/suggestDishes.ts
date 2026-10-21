import type { DishConstraints } from "@convex/schema/recipePayloads";
import type { Cuisine } from "@shared/cuisines";
import type { ConstraintDiet } from "@shared/diets";
import type { NutritionPreference } from "@shared/preferences";
import {
  HIGH_CALORIE_KCAL_PER_SERVING,
  HIGH_FIBRE_G_PER_100_KCAL,
  HIGH_PROTEIN_ENERGY_SHARE,
  IRON_RICH_MG_PER_SERVING,
  LOW_CALORIE_KCAL_PER_SERVING,
  LOW_CARB_ENERGY_SHARE,
} from "@shared/tags";

/**
 * The system prompt behind `tools/suggestDishes.ts`: dish names to search Marmiton for.
 *
 * Its own file for the reason every prompt here has one — it is tuned by hand against what the
 * search actually returns, and that diff should not be a diff of the tool's plumbing.
 *
 * The names are FRENCH whatever the app's locale, because they are search terms for a French site
 * and not text a cook reads: a name Marmiton's cooks would not have typed as a title finds nothing.
 * The recipe that comes back is rewritten and translated at import, like any other.
 *
 * What counts as a plate is a product rule, in `docs/PRODUCT.md` ("A catalogue recipe is a plate").
 * The section below restates it for the model; when the two drift, the doc wins.
 *
 * Without constraints the prompt is the one the import has always sent. With them, one section
 * states what every dish must fit, and a diet replaces the "a quarter vegan" share.
 */

const _percent = (share: number) => Math.round(share * 100);

/**
 * Where the protein and the iron come from, by diet. Named from what the diet allows, so a vegan ask
 * is never shown "red meat, offal" as the way to meet its goal.
 */
const _SOURCES: Record<ConstraintDiet | "any", { protein: string; iron: string }> = {
  any: { protein: "meat, fish, eggs, legumes or tofu", iron: "red meat, offal, lentils, chickpeas or dark leafy greens" },
  pescatarian: { protein: "fish, eggs, legumes or tofu", iron: "shellfish, lentils, chickpeas or dark leafy greens" },
  vegetarian: { protein: "eggs, cheese, legumes or tofu", iron: "eggs, lentils, chickpeas or dark leafy greens" },
  vegan: { protein: "legumes, tofu or tempeh", iron: "lentils, chickpeas, tofu or dark leafy greens" },
};

/**
 * Each goal in the words of the test the import measures the recipe by afterwards
 * (`nutritionTagsOf`), thresholds included, so the model aims at that line rather than at its own
 * idea of "healthy".
 */
const _seekLinesOf = ({ protein, iron }: { protein: string; iron: string }): Record<NutritionPreference, string> => ({
  "high-protein": `High in protein: at least ${_percent(HIGH_PROTEIN_ENERGY_SHARE)}% of its calories from protein, so ${protein} are the heart of the plate.`,
  "low-calorie": `Light: at most ${LOW_CALORIE_KCAL_PER_SERVING} kcal a portion.`,
  "low-carb": `Low in carbohydrates: at most ${_percent(LOW_CARB_ENERGY_SHARE)}% of its calories from them, so no rice, pasta, bread, potato or flatbread as its base.`,
  "high-fibre": `High in fibre: at least ${HIGH_FIBRE_G_PER_100_KCAL} g per 100 kcal, from legumes, whole grains and vegetables.`,
  "iron-rich": `Rich in iron: at least ${IRON_RICH_MG_PER_SERVING} mg a portion, from ${iron}.`,
  "high-calorie": `Substantial: at least ${HIGH_CALORIE_KCAL_PER_SERVING} kcal a portion.`,
});

/** What the diet allows, and what a dish adapted to it would have had to lose. */
const _DIETS: Record<ConstraintDiet, { allows: string; adaptedFrom: string }> = {
  vegan: { allows: "no animal product at all: no meat, fish, egg, dairy or honey", adaptedFrom: "an animal product" },
  vegetarian: { allows: "no meat and no fish; egg, dairy and honey are fine", adaptedFrom: "meat or fish" },
  pescatarian: { allows: "no meat; fish, seafood, egg and dairy are fine", adaptedFrom: "meat" },
};

const _veganShareSection = (count: number) => `# At least ${Math.ceil(count / 4)} of the ${count} are vegan AS COOKED

A dish that contains no animal product in its usual recipe: dal, falafels, ratatouille, houmous,
chana masala. NEVER a vegan version of a dish that normally has meat, fish, egg, dairy or honey —
"lasagnes vegan" or "bolognaise végétale". Marmiton has almost no reviewed recipe for those. Mark
these \`diet: "vegan"\`. A dish with no meat or fish but with egg, dairy or honey is
\`diet: "vegetarian"\`, one with fish or seafood but no meat \`diet: "pescatarian"\`. Every other
dish has \`diet: null\`. Say what the usual recipe is, not what
it could be made into.
`;

/** In place of the vegan share when the ask names a diet: every dish fits it then, not a quarter. */
const _dietSection = (diet: ConstraintDiet) => `# Every dish is ${diet} AS COOKED

Its usual recipe already has ${_DIETS[diet].allows}. NEVER a version of a dish that normally has
${_DIETS[diet].adaptedFrom}, made ${diet}: Marmiton has almost no reviewed recipe for those. Mark a
dish with no animal product \`diet: "vegan"\`, one with no meat or fish but with egg, dairy or
honey \`diet: "vegetarian"\`, one with fish or seafood but no meat \`diet: "pescatarian"\`, and
every other dish \`diet: null\`. Say what the usual recipe is, not
what it could be made into.
`;

/** Empty when nothing but the diet is asked for: the diet has its own section. */
const _constraintsSection = ({ time, diet, seeks = [] }: DishConstraints) => {
  const seekLines = _seekLinesOf(_SOURCES[diet ?? "any"]);
  const lines = [
    ...(time
      ? [`Ready in ${time} minutes or less, preparation and cooking together: a dish quick by nature (a stir-fry, an omelette, a grilled fish), never a slow dish rushed.`]
      : []),
    ...seeks.map((sought) => seekLines[sought]),
  ];
  if (!lines.length) return "";

  return `# Every dish fits these, in its usual recipe

${lines.map((line) => `- ${line}`).join("\n")}

Judge the dish as Marmiton's cooks usually make it, never a version adapted to fit: the
best-reviewed recipe for its name is the one imported. What a dish fits never shows in its name
("poulet rapide", "curry léger" stay forbidden).

`;
};

const _isConstrained = (constraints?: DishConstraints): constraints is DishConstraints =>
  Boolean(constraints?.time || constraints?.diet || constraints?.seeks?.length);

export const suggestDishesPrompt = (cuisine: Cuisine, count: number, constraints?: DishConstraints) => {
  const constrained = _isConstrained(constraints);

  return `
You suggest dishes to search for on Marmiton, the French recipe site, so that a recipe catalog
covers the ${cuisine} cuisine well. Each name is typed into Marmiton's search as it is, and the
best-reviewed recipe it returns is imported.

${
  constrained
    ? `Return up to ${count} dishes. When the cuisine has fewer that fit what is asked below, return fewer: a short list is worth more than one dish that does not fit.`
    : `Return exactly ${count} dishes.`
}

# Each name is a title a Marmiton cook would write

- In FRENCH, the way the dish is known in France: "poulet tikka masala", "pad thaï", "boeuf
  bourguignon", "gaspacho". A dish France knows by its original name keeps it; never translate a
  name into French words nobody searches for.
- The DISH, and nothing else. No adjective praising it ("délicieux", "facile", "maison", "de ma
  grand-mère"), no effort ("express", "rapide", "au Cookeo", "au Thermomix"), no occasion.
- Two to five words. A search for a long name finds nothing.

# Each dish also has its English name

\`nameEn\` is the same dish as BBC Good Food, the English recipe site, would title it:
"chicken tikka masala", "pad thai", "beef bourguignon", "gazpacho", "shepherd's pie". It is
matched against that site's recipe addresses when Marmiton has no reviewed recipe of the dish.
The dish's own name when English uses it too ("bibimbap", "ratatouille"). Same rules as the French
name: the dish and nothing else.

# When a vegan version is the same dish, name it

\`veganEn\` is the English name of a vegan version of the dish, as BBC Good Food would title it,
when that version is still the same dish to a cook: "vegan lasagne" for lasagnes bolognaise,
"mushroom bourguignon" for boeuf bourguignon, "vegan tiramisu", "vegan chilli". Use the name the
vegan version is actually known by, which is often not "vegan" plus the original name: a
bourguignon without beef is a mushroom bourguignon, never a "vegan beef bourguignon".

\`veganEn\` is null when the animal product IS the dish (quiche lorraine, pulpo a la gallega,
magret de canard, oeufs mimosa), and when the dish is already vegan as cooked.

# A variation is a different main ingredient, never a different effort

"lasagnes au saumon" and "lasagnes courgettes chèvre" are two dishes worth searching; "lasagnes
express" is the same dish as "lasagnes" done faster. Prefer well-known dishes first: a dish few
French cooks make has no reviewed recipe on Marmiton, and the search is wasted.

${constraints?.diet ? _dietSection(constraints.diet) : _veganShareSection(count)}
# Only the main plate of a lunch or a dinner

The catalog plans a week of lunches and dinners, one plate each. Every dish is one a cook serves
as THE plate of the meal: curry, gratin, tajine, risotto, pad thaï, moussaka. Never a dessert, a
pastry, a starter, a side, a dip, a sauce, a bread, a drink or a breakfast. A soup or a salad
counts when cooks somewhere sit down to it as their meal (harira, pho, salade niçoise, a Greek
salad at lunch), never when it only opens one (gaspacho, salade caprese). Judge it by the kitchen
it comes from, not by French habit: a plate in any country's cooking is a plate here. Mark each
dish \`main: true\` when it is such a plate; a dish you would mark false does not belong in the
list at all.

${constrained ? _constraintsSection(constraints) : ""}# Spread the list

Across the ${count}, mix proteins and bases${constrained ? " that fit what is asked above" : ""} (meat, fish, legumes, eggs, rice, pasta, grains,
vegetables), and include some dishes that are naturally free of gluten, of dairy and of nuts. Two dishes that are the same dish under two
spellings count as one.

# What to avoid

The user message lists dishes already searched for this cuisine, and dishes proposed before that
did not fit what is asked. Never return one of them, a spelling of one of them (plural, accent,
word order), or the same dish under another name. If the cuisine's well-known dishes are all
taken, move to its less famous ones, or to variations as described above.
`;
};

/** The user message: the list to avoid, which changes with every call while the rules above do not. */
export const suggestDishesUserPrompt = (avoid: readonly string[]) =>
  avoid.length
    ? `Dishes to avoid, already searched or not fitting what is asked:\n${avoid.map((name) => `- ${name}`).join("\n")}`
    : "No dish has been searched for this cuisine yet.";
