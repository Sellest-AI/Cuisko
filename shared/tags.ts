import { type Allergen } from "./allergens";
import { type Diet, mostPermissiveDietOf } from "./diets";

/**
 * The tag vocabulary — the facets a recipe can be filtered by.
 *
 * Closed for the reason [`CUISINES`](./cuisines.ts) is, plus one of its own: a free-string tag list
 * is unbounded, and no filter UI can be built against a column whose values are not known in
 * advance. A chip row is drawn from this list; anything outside it would be unreachable.
 *
 * Grouped by what the tag answers, because that is what keeps the model from stacking three tags
 * that all say the same thing: what a diet allows, when the dish is eaten, what it costs to make.
 * A recipe carries as many as apply, and none is implied by another — "vegan" does not write
 * "vegetarian", since the filter that wants vegetarian recipes asks for both.
 *
 * Split in two by WHO decides, not by what the tag means: [`COMPUTED_TAGS`](#COMPUTED_TAGS) fall
 * out of the ingredients, [`AUTHORED_TAGS`](#AUTHORED_TAGS) do not. `TAGS` is both, and stays the
 * vocabulary everything downstream — the column, the filters — is written against.
 */
/**
 * The tags that are a function of the ingredient list, and are therefore never written by hand.
 *
 * Every one of these is decidable IN PRINCIPLE from what the recipe contains: a dish is
 * gluten-free or it is not, and the answer is in the rows, not in anyone's judgement. So the
 * generation vocabulary ([`AUTHORED_TAGS`](#AUTHORED_TAGS)) leaves them out — a model asked for a
 * tag it cannot verify answers with the one that sounds right, and "gluten-free" sounding right is
 * how someone who filtered on it gets served soy sauce.
 *
 * All ten are computed by `computeTags`, each from a fact the seed catalog carries per row: the
 * diet three from `ingredients.diet`, the free-from three from `ingredients.allergens`, the
 * nutrition four from the macros.
 *
 * ⚠️ **Absent is "unknown", never "does not contain".** Six of the ten are claims of absence, and
 * a claim of absence cannot be made from data nobody wrote. `computeTags` therefore emits NONE of
 * a group rather than a partial answer whenever a line is unmatched, uncategorised or outside the
 * catalog — see the refusals documented there. Anything rendering these must word them as "no
 * known gluten", because that is the strongest thing the catalog can support.
 */
export const COMPUTED_TAGS = [
  // Diet — what it contains, not what it is worth
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "high-protein",
  "low-carb",
  "low-calorie",
  "high-calorie",
] as const;

/**
 * The tags no ingredient list can settle — what the dish is FOR, and what it costs to make.
 *
 * Nothing in the rows says a recipe is a starter rather than a main, festive rather than everyday,
 * or worth cooking a double batch of. These are read off the recipe as a whole, which is why they
 * are the ones the model writes.
 */
export const AUTHORED_TAGS = [
  // Course — where it lands in a meal
  "breakfast",
  "brunch",
  "starter",
  "main",
  "side",
  "dessert",
  "snack",
  "drink",
  // Form — what it looks like on the plate
  "soup",
  "salad",
  "sandwich",
  "pasta",
  "bowl",
  "baking",
  // Effort — what it costs to make, which is what the planner filters on
  "quick",
  "one-pot",
  "no-cook",
  "make-ahead",
  "batch-cooking",
  "freezer-friendly",
  "budget",
  // Occasion
  "comfort-food",
  "festive",
  "kid-friendly",
  "spicy",
] as const;

/** The full vocabulary — what the column validates against and what a filter chip row is drawn from. */
export const TAGS = [...COMPUTED_TAGS, ...AUTHORED_TAGS] as const;

export type Tag = (typeof TAGS)[number];

/** What a generated recipe may carry before the computed half is added to it. */
export type AuthoredTag = (typeof AUTHORED_TAGS)[number];

/** The half of the vocabulary that is derived from the rows, never written by a model or a cook. */
export type ComputedTag = (typeof COMPUTED_TAGS)[number];

export const isTag = (value: string): value is Tag => TAGS.some((tag) => tag === value);

/**
 * Which diets a recipe is SUITABLE FOR, from the diet of each of its lines.
 *
 * Suitability, not identity, so the set nests: a vegan dish is also vegetarian and also fine for a
 * pescatarian, and all three are written. That is what makes the filter a single `includes` — a
 * filter that had to know "pescatarian" also means "vegetarian OR vegan" is one someone gets
 * wrong once and nobody notices, because the failure is a recipe quietly missing from a list.
 *
 * ⚠️ **This is only as good as the diets it is handed**, and every one of them is a claim of
 * absence — see [`DIETS`](./diets.ts). The caller is responsible for handing over a diet per line
 * that the catalog can actually stand behind, and for refusing to compute at all when a line did
 * not resolve or carries no diet: an unknown ingredient is not a vegetable.
 */
export const dietTagsOf = (diets: readonly Diet[]): ComputedTag[] => {
  switch (mostPermissiveDietOf(diets)) {
    case "vegan":
      return ["pescatarian", "vegetarian", "vegan"];
    case "vegetarian":
      return ["pescatarian", "vegetarian"];
    case "pescatarian":
      return ["pescatarian"];
    case "omnivore":
      return [];
  }
};

/**
 * Which allergen each free-from tag is a claim about.
 *
 * `nut-free` covers two, and they are genuinely two allergens rather than one written twice: a
 * peanut is a legume, and someone allergic to tree nuts is routinely fine with it. The tag is
 * still a single chip because nobody filtering a recipe list wants to tick both — so the tag is
 * withheld if EITHER is present, which is the direction that errs toward the cook.
 */
const TAG_ALLERGENS: Record<"gluten-free" | "dairy-free" | "nut-free", readonly Allergen[]> = {
  "gluten-free": ["gluten"],
  "dairy-free": ["milk"],
  "nut-free": ["nuts", "peanuts"],
};

/**
 * The free-from tags, from every allergen the recipe's ingredients are KNOWN to carry.
 *
 * `present` must be the union over ALL of the recipe's lines, and the caller must be able to say
 * that every one of them was actually classified. An empty list here means "nothing carries an
 * allergen", and this returns all three tags for it — which is right when the lines came from the
 * seed catalog and a confident false negative on an allergy when they did not. Deciding that is
 * the caller's job, not this function's; `computeTags` does it by requiring every line to resolve
 * to a catalog row whose `allergens` is not `undefined`, and emitting no free-from tag at all
 * otherwise.
 */
export const allergenTagsOf = (present: readonly Allergen[]): ComputedTag[] =>
  (Object.entries(TAG_ALLERGENS) as [ComputedTag, readonly Allergen[]][])
    .filter(([, allergens]) => !allergens.some((allergen) => present.includes(allergen)))
    .map(([tag]) => tag);

/**
 * The tags that are also FILTER FACETS — a promise the app makes, rather than a word it suggests.
 *
 * These six are exactly the claims of absence. A cook who filters on one is being told something,
 * not offered something, which is why they cannot be answered by a relevance ranking. See
 * `facetsOf`.
 */
const FACET_TAGS = {
  isVegan: "vegan",
  isVegetarian: "vegetarian",
  isPescatarian: "pescatarian",
  isGlutenFree: "gluten-free",
  isDairyFree: "dairy-free",
  isNutFree: "nut-free",
} as const satisfies Record<string, ComputedTag>;

/** The six booleans a recipe row carries so a search index can filter on them exactly. */
export type RecipeFacets = Record<keyof typeof FACET_TAGS, boolean>;

/**
 * The `tags` array projected onto the six booleans a `filterField` can match.
 *
 * **Why the duplication is deliberate.** `tags` already holds these, but Convex has no indexable
 * equality for array membership, so the array can be rendered and cannot be filtered. The six
 * booleans are the filterable projection of it — and they are computed HERE, from the finished tag
 * list, so the two cannot disagree: there is no second derivation to keep in step, only a view of
 * the first.
 *
 * **Why booleans and not one ordinal `dietRank`.** A `filterField` matches by equality and never by
 * range, so `eq("dietRank", 0)` would find vegan recipes and miss them for a vegetarian filter.
 * The nesting `dietTagsOf` already writes — a vegan recipe carries all three diet tags — is what
 * makes one equality check per facet the correct and complete shape.
 *
 * ⚠️ A recipe whose tags could not be computed gets `false` everywhere, which is right: `false`
 * means "not claimed", and an unclaimed recipe must not surface in a filter that promises the
 * claim. It does NOT mean the recipe contains gluten.
 */
export const facetsOf = (tags: readonly Tag[]): RecipeFacets => {
  const entries = Object.entries(FACET_TAGS) as [keyof RecipeFacets, ComputedTag][];

  return Object.fromEntries(
    entries.map(([facet, tag]) => [facet, tags.includes(tag)]),
  ) as RecipeFacets;
};

/** Energy per gram, in kcal — the denominators behind every share below. */
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;

/**
 * Thresholds as SHARES of energy rather than as gram counts, so they do not track portion size:
 * a 200 kcal side and a 900 kcal main are both "high-protein" on the same terms.
 *
 * `high-protein` is the EU nutrition claim — at least 20% of energy from protein. `low-carb` has
 * no legal definition; 26% is the figure the diet literature converges on. The two calorie tags
 * are the ones that cannot be shares, since they are statements about the portion itself.
 *
 * Neither calorie figure has a legal definition either, so both are working thresholds rather than
 * regulated claims. 850 kcal reserves `high-calorie` for a portion that is plainly substantial
 * rather than merely above average, and the 350 kcal of daylight between the two is what makes
 * them mutually exclusive by arithmetic rather than by a rule somebody has to remember.
 *
 * ⚠️ `high-calorie` is a FILTER someone chose, never a verdict on what they cooked — see
 * [`NUTRITION_PREFERENCES`](./preferences.ts). Someone eating to gain weight is served by it
 * exactly as much as someone eating to lose is served by its opposite.
 */
const HIGH_PROTEIN_ENERGY_SHARE = 0.2;
const LOW_CARB_ENERGY_SHARE = 0.26;
const LOW_CALORIE_KCAL_PER_SERVING = 500;
const HIGH_CALORIE_KCAL_PER_SERVING = 850;

/** The three facts the nutrition tags are decided from, for ONE serving. */
export type ServingFacts = {
  calories: number;
  protein: number;
  carbohydrates: number;
};

/**
 * The nutrition half of the computed tags, from one serving's macros.
 *
 * A recipe whose total could not be worked out has no facts to hand here and gets no nutrition
 * tags at all — `totalsOf` already returns `undefined` rather than a partial total, and the
 * distinction between "not low-calorie" and "we could not weigh the olive oil" has to survive.
 *
 * Zero calories yields nothing rather than dividing by it: a recipe of water and salt is not
 * high-protein, and it is not the interesting case either.
 */
export const nutritionTagsOf = ({ calories, protein, carbohydrates }: ServingFacts): ComputedTag[] => {
  const tags: ComputedTag[] = [];

  if (calories <= 0) return tags;

  if ((protein * KCAL_PER_G_PROTEIN) / calories >= HIGH_PROTEIN_ENERGY_SHARE) {
    tags.push("high-protein");
  }

  if ((carbohydrates * KCAL_PER_G_CARB) / calories <= LOW_CARB_ENERGY_SHARE) {
    tags.push("low-carb");
  }

  if (calories <= LOW_CALORIE_KCAL_PER_SERVING) tags.push("low-calorie");
  if (calories >= HIGH_CALORIE_KCAL_PER_SERVING) tags.push("high-calorie");

  return tags;
};
