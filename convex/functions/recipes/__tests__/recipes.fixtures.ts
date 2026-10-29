import type { Doc, Id } from "@convex/_generated/dataModel";
import { writeRecipeContent, type RecipeText } from "@convex/functions/recipes/recipeContent";
import type { MutationCtx } from "@convex/procedures";
import { facetsOf } from "@shared/tags";

// The second dot in this file's name keeps it off every deployment, like convex/__tests__/scheduler.fixtures.ts.

/** A recipe as a test writes it by hand: every stored column, and its text. */
export type TestRecipe = Omit<Doc<"recipes">, "_id" | "_creationTime"> & RecipeText;

/**
 * A live, generated French recipe that claims nothing: no tags, so no diet facet, no owner, no
 * timings and no text. Each test states only the columns it is about.
 */
const DEFAULTS: Omit<TestRecipe, "updatedAt"> = {
  status: "generated",
  isArchived: false,
  title: { values: { fr: "Soupe" }, meta: {} },
  description: { values: { fr: "" }, meta: {} },
  instructions: { values: { fr: "" }, meta: {} },
  servings: 2,
  equipments: [],
  difficulty: 1,
  tags: [],
  cuisine: "french",
  timings: {},
  search: { en: "", fr: "" },
  ...facetsOf([]),
};

/**
 * Inserts a recipe and its `recipeContents` row, the two rows every recipe has.
 *
 * For the tests that state a row rather than going through `insertRecipe`, which derives the tags,
 * facets and search from ingredient lines a test may not have. So nothing here is derived either:
 * a test giving `tags: ["vegan"]` states `isVegan` too. The text goes where the schema keeps it,
 * through the same writer production uses.
 */
export const insertTestRecipe = async (db: MutationCtx["db"], overrides: Partial<TestRecipe> = {}): Promise<Id<"recipes">> => {
  const { description, instructions, ...row } = { ...DEFAULTS, updatedAt: Date.now(), ...overrides };
  const recipeId = await db.insert("recipes", row);
  // An explicit `undefined` drops a recipe column, as a legacy row needs; the text has no such row.
  await writeRecipeContent({ db }, recipeId, {
    description: description ?? DEFAULTS.description,
    instructions: instructions ?? DEFAULTS.instructions,
  });

  return recipeId;
};
