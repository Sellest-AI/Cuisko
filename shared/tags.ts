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
 * ⚠️ **In practice only six of the nine are computed today**, by `computeTags`: the three diet
 * tags and the three nutrition ones. `gluten-free`, `dairy-free` and `nut-free` are still
 * unreachable — they need the `ingredientAllergens` join table, which the schema declares and
 * nothing yet writes. Deriving them from an empty table would mark every recipe free of
 * everything, which is the soy-sauce failure inverted and worse: a confident false negative on an
 * allergy. They stay absent until the catalog carries allergens, and absent must therefore be read
 * as "unknown", never as "contains it".
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
 * What one ingredient line contributes to the diet question.
 *
 * Booleans rather than the ingredient's category, for the same reason `RecipeLine.produce` is a
 * boolean: the category vocabulary lives in the schema and this file sits underneath it.
 *
 * ⚠️ These say what an ingredient IS KNOWN to contain, and a `false` is therefore not proof of
 * absence — see `dietTagsOf`.
 */
export type DietLine = {
  /** Flesh of a land animal. */
  meat: boolean;
  /** Fish or shellfish. */
  seafood: boolean;
  /** Animal-derived without the animal — dairy, eggs, honey. */
  fromAnimal: boolean;
};

/**
 * Which diets a recipe is SUITABLE FOR, from what its lines are known to contain.
 *
 * Suitability, not identity, so the set nests: a vegan dish is also vegetarian and also fine for a
 * pescatarian, and all three are written. That is what makes the filter a single `includes` — a
 * filter that had to know "pescatarian" also means "vegetarian OR vegan" is one someone gets
 * wrong once and nobody notices, because the failure is a recipe quietly missing from a list.
 *
 * ⚠️ **This is only as good as the flags it is handed.** Every one of these is a claim of ABSENCE,
 * and absence cannot be proven from a catalog that does not model it: fish sauce is a `CONDIMENT`
 * and honey is a `SWEETENER`, so a caller deriving these flags from `category` alone will call a
 * pad thai vegetarian. The caller is responsible for handing over flags it can actually stand
 * behind, and for refusing to compute at all when a line did not resolve — a missing line is an
 * unknown ingredient, and an unknown ingredient is not a vegetable.
 */
export const dietTagsOf = (lines: DietLine[]): ComputedTag[] => {
  const meat = lines.some((line) => line.meat);
  const seafood = lines.some((line) => line.seafood);
  const fromAnimal = lines.some((line) => line.fromAnimal);

  const tags: ComputedTag[] = [];

  if (!meat) tags.push("pescatarian");
  if (!meat && !seafood) tags.push("vegetarian");
  if (!meat && !seafood && !fromAnimal) tags.push("vegan");

  return tags;
};

/** Energy per gram, in kcal — the denominators behind every share below. */
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;

/**
 * Thresholds as SHARES of energy rather than as gram counts, so they do not track portion size:
 * a 200 kcal side and a 900 kcal main are both "high-protein" on the same terms.
 *
 * `high-protein` is the EU nutrition claim — at least 20% of energy from protein. `low-carb` has
 * no legal definition; 26% is the figure the diet literature converges on. `low-calorie` is the
 * one that cannot be a share, since it is a statement about the portion itself.
 */
const HIGH_PROTEIN_ENERGY_SHARE = 0.2;
const LOW_CARB_ENERGY_SHARE = 0.26;
const LOW_CALORIE_KCAL_PER_SERVING = 400;

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

  return tags;
};
