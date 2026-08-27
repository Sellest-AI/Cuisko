/**
 * What an ingredient is suitable for, as ONE ordinal value rather than a set of exclusions.
 *
 * The list is ordered strictest → most permissive, and **the order is the semantics**: a diet at
 * index `n` is suitable for everyone at index `n` and beyond, which is what makes a recipe's diet
 * a plain maximum over its lines. Reordering this list silently changes what every recipe is
 * tagged with, so it is not an alphabetical list and must never be sorted.
 *
 * Why one field and not three booleans (`meat` / `seafood` / `fromAnimal`): the diets nest
 * perfectly, so three booleans have four reachable states out of eight and the other four are
 * nonsense a caller has to remember not to write. The cost is that it cannot express "contains egg
 * AND fish" — nothing downstream asks, and `ingredients.allergens` is where that question belongs
 * anyway. See [`ALLERGENS`](./allergens.ts).
 *
 * ⚠️ This is a claim of ABSENCE, and it is why the catalog carries it per row rather than deriving
 * it from `category`. A category proves what an ingredient IS and can never prove what it is not:
 * fish sauce is a `CONDIMENT`, honey a `SWEETENER`, gelatin an `OTHER`. Every one of them reads as
 * a vegetable to anything that asks the category.
 */
export const DIETS = ["vegan", "vegetarian", "pescatarian", "omnivore"] as const;

export type Diet = (typeof DIETS)[number];

/**
 * The most permissive diet among `diets` — what a dish made of exactly these ingredients is
 * suitable for.
 *
 * One omnivore line makes the whole dish omnivore, which is the ordering above doing the work: the
 * answer is the maximum, not a vote. An empty list is `vegan` by the same rule a sum of nothing is
 * zero — and callers never hand one over, because a recipe with no ingredients has no tags to
 * compute in the first place.
 *
 * ⚠️ **The name is the value it returns, not the audience it describes**, and those run opposite
 * ways: the most permissive diet in the list is the one that admits the FEWEST eaters. Naming it
 * for the audience instead — "strictest" — reads as though a vegan line would win the reduce, which
 * is the inversion of what it does.
 */
export const mostPermissiveDietOf = (diets: readonly Diet[]): Diet =>
  diets.reduce<Diet>(
    (widest, diet) => (DIETS.indexOf(diet) > DIETS.indexOf(widest) ? diet : widest),
    "vegan",
  );
