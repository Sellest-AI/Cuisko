/**
 * What kind of thing an ingredient is — the aisle it would be found in.
 *
 * Closed for the reason [`CUISINES`](./cuisines.ts) and [`TAGS`](./tags.ts) are: the column
 * validates against it, the seed catalog classifies against it, and a filter row would be drawn
 * from it. A free string would let two spellings of "vegetable" into the table with no symptom.
 *
 * Here rather than in the schema — where it used to sit — because it is read on both sides now.
 * `convex/schema/ingredients.ts` builds its validator from this list, and the recipe page groups a
 * recipe's lines by it; a vocabulary that only the backend could name would mean the screen
 * writing its own copy of these sixteen strings, which is the shape that drifts.
 */
export const CATEGORIES = [
  "VEGETABLE",
  "FRUIT",
  "GRAIN",
  "MEAT",
  "SEAFOOD",
  "DAIRY",
  "EGG",
  "LEGUME",
  "NUT",
  "SEED",
  "HERB",
  "SPICE",
  "OIL",
  "CONDIMENT",
  "SWEETENER",
  "OTHER",
] as const;

export type Category = (typeof CATEGORIES)[number];
