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
 * Every one of these is decidable from what the recipe contains: a dish is gluten-free or it is
 * not, and the answer is in the rows, not in anyone's judgement. So they are computed at save
 * time from the resolved ingredients and their nutrition, and the generation vocabulary
 * ([`AUTHORED_TAGS`](#AUTHORED_TAGS)) leaves them out — a model asked for a tag it cannot verify
 * answers with the one that sounds right, and "gluten-free" sounding right is how someone who
 * filtered on it gets served soy sauce.
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

export const isTag = (value: string): value is Tag => TAGS.some((tag) => tag === value);
