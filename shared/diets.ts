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
 * The diets with neither meat nor fish: the prefix of `DIETS` a dish is vegetarian at.
 *
 * What the catalog import records as a dish's INTENDED diet, before it has any ingredients to
 * compute one from. Pescatarian and omnivore are both "no intent" there, since the only question
 * the import's coverage print asks is how many of the dishes asked for were meant to be meat-free.
 */
export const VEGETARIAN_DIETS = ["vegan", "vegetarian"] as const satisfies readonly Diet[];

export type VegetarianDiet = (typeof VEGETARIAN_DIETS)[number];

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

/**
 * The strictest diet among `diets` — what a table of exactly these eaters can all share.
 *
 * The mirror of [`mostPermissiveDietOf`](#mostPermissiveDietOf): the minimum over the same
 * ordering rather than the maximum. One vegan at the table makes the meal vegan, because a shared
 * dish has one diet and the only one everybody can eat is the strictest anyone holds.
 *
 * An empty list is `omnivore` — the identity for a minimum, and the opposite end from the other
 * function's `vegan` for the same reason. Nobody at the table constrains nothing.
 *
 * ⚠️ **These two run in opposite directions over the same vocabulary, and the names describe the
 * value each returns rather than who it serves.** `mostPermissiveDietOf` answers *what is this
 * dish*, from its ingredient lines; this one answers *what can this table eat*, from its people.
 * Handing a list of ingredient diets to this one yields the diet of the single strictest line —
 * a dish of chicken and rice reported as vegan.
 */
export const strictestDietOf = (diets: readonly Diet[]): Diet =>
  diets.reduce<Diet>(
    (strictest, diet) => (DIETS.indexOf(diet) < DIETS.indexOf(strictest) ? diet : strictest),
    "omnivore",
  );
