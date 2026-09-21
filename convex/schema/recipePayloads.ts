/**
 * The recipe shapes that cross a function boundary but are never a row.
 *
 * Separate from `recipes.ts` because they answer a different question. `defineTable` there
 * describes what the database holds; these describe what a payload looks like in flight — what the
 * agent hands to `createOne`, what it hands to `translateOne`. `vSanitizedRecipe` says as much
 * itself below: it deliberately is not `recipes.validator`.
 *
 * They stay under `convex/schema/` rather than beside their routers because they are built from
 * this folder's vocabulary — `vEquipments`, `vUnit`, `vLocale`, `DIFFICULTY_LEVELS` — and a change
 * to the `recipes` table has to force a look at them.
 */

import { type Infer, v } from "convex/values";
import { vLocale, vLocalized, vLocalizedList } from "./i18n";
import { vUnit } from "./ingredients";
import { vEquipments } from "./cellars";
import { recipes } from "./recipes";
import { DIFFICULTY_LEVELS } from "@shared/recipes";
import { CUISINES } from "@shared/cuisines";
import { AUTHORED_TAGS } from "@shared/tags";

/**
 * Instruction groups as the agent hands them over, before `serializeInstructions` flattens them
 * into the single string a `vLocalized` column can hold. The flat form is what the database
 * stores; this is what crosses a function boundary on the way there and back.
 */
export const vInstructionGroups = v.array(
  v.object({ title: v.optional(v.string()), steps: v.array(v.string()) }),
);

/**
 * The fields the agent guesses and the cook may correct, stated once for both payloads that carry
 * them — `vRecipeEdit` and `vSanitizedRecipe` below.
 *
 * `vAuthoredTags` is `AUTHORED_TAGS`, not `TAGS`: the computed half falls out of the ingredients,
 * so neither a model nor a client can be the one to send it.
 */
const vAuthoredTags = v.array(v.union(...AUTHORED_TAGS.map(v.literal)));
const vDifficulty = v.union(...DIFFICULTY_LEVELS.map(v.literal));
export const vCuisine = v.union(...CUISINES.map(v.literal));
const vTimings = v.object({
  preparation: v.optional(v.number()),
  cooking: v.optional(v.number()),
  resting: v.optional(v.number()),
});

/**
 * The free text a cook's edit carries, as `updateOne` accepts it off the wire.
 *
 * Every field required, unlike `createOne`'s — a create may be handed a bare idea and let the agent
 * name it, but an edit reopens a recipe that already has a title, so a missing one is a client bug
 * rather than a blank to fill in. The same goes for the five fields below `instructions`: the agent
 * guessed them on the first save, and an edit is where the cook corrects them. `assertFilledIn` is what refuses the whitespace-only version this
 * validator cannot see.
 *
 * Kept here rather than in the router so that it and `RecipeEdit` — the TypeScript half, in
 * `functions/recipes/recipeChangesOf.ts` — are the only two statements of this shape. They must
 * agree; a third copy inside a router is the one that would drift unnoticed.
 */
export const vRecipeEdit = {
  title: v.string(),
  description: v.string(),
  servings: v.number(),
  ingredients: v.string(),
  instructions: v.string(),
  tags: vAuthoredTags,
  equipments: vEquipments,
  difficulty: vDifficulty,
  cuisine: vCuisine,
  timings: vTimings,
};

/**
 * One `recipeIngredients` row before it has a recipe to belong to.
 *
 * It crosses a boundary rather than being derived behind one, and that is the point of the slice:
 * resolving a name into a catalog row may reach a dataset, a live API and a model, so it happens
 * in the ACTION, and the mutation that persists the recipe is handed the answer. `RecipeLink` in
 * `functions/recipes/resolveRecipeIngredients.ts` is the TypeScript half of this shape.
 *
 * No `recipeId`: on a create there is no row yet, and on an edit the mutation already knows which
 * one it is patching.
 */
export const vRecipeLink = v.object({
  ingredientId: v.id("ingredients"),
  position: v.number(),
  quantity: v.number(),
  unit: vUnit,
});

/**
 * A scraped page as the editor's fields, on its way to a form rather than to a mutation.
 *
 * The free-text half of `vRecipeEdit` above, and kept separate from it on purpose: they answer to
 * different things. An import has none of the five guessed fields yet — the agent fills those in on
 * the first save. `vRecipeEdit` is what an edit of an existing recipe must carry, and it is
 * required-everywhere because that recipe already has a title. This is what an IMPORT returns, and
 * its `title` is required for the opposite reason — a text field cannot hold `undefined`, so an
 * untitled scrape seeds `""` for the cook to fill in. Folding the two together would mean the next
 * change to what an edit must carry silently changed what an import returns.
 *
 * `sourceUrl` is the page the draft was read from, canonical, and optional because the mapper
 * that builds the draft is URL-blind: `importOne` attaches it after the scrape.
 *
 * `RecipeDraft` in `lib/scraping/toRecipeDraft.ts` is the TypeScript half of this shape.
 */
export const vRecipeDraft = v.object({
  title: v.string(),
  description: v.string(),
  servings: v.number(),
  ingredients: v.string(),
  instructions: v.string(),
  sourceUrl: v.optional(v.string()),
});

/**
 * A recipe as `sanitizeRecipe` returns it: ONE language, every localized field a bare string, and
 * every ingredient a name rather than a catalog id.
 *
 * It deliberately is not `recipes.validator`. The two differences are the whole of the slice —
 * translation is a second agent that runs after the insert, and turning a name into a catalog row
 * is `functions/recipes/resolveRecipeIngredients.ts`, which runs in the ACTION and hands its answer
 * to the mutation as `vRecipeLink` above. Keeping the payload in this shape is what lets
 * `saveRecipe` be the one place that knows how a generation becomes a document.
 */
export const vSanitizedRecipe = v.object({
  title: v.string(),
  description: v.string(),
  servings: v.number(),
  difficulty: vDifficulty,
  cuisine: vCuisine,
  tags: vAuthoredTags,
  equipments: vEquipments,
  timings: vTimings,
  instructions: vInstructionGroups,
  ingredients: v.array(v.object({ name: v.string(), quantity: v.number(), unit: vUnit })),
});

/**
 * One recipe rendered into ONE language, carrying the locale it was rendered into.
 *
 * The locale travels with the recipe rather than beside it in a parallel array, for the reason
 * `TranslatedRecipe` gives: the model returns languages in whatever order it worked through them,
 * and a caller matching by index files a German recipe under `fr`.
 */
export const vTranslatedRecipe = v.object({
  locale: vLocale,
  recipe: v.object({
    title: v.string(),
    description: v.string(),
    instructions: vInstructionGroups,
  }),
});

/**
 * The `recipes` columns a portable recipe carries: every one but the three that are ids.
 *
 * Taken from the table's own validator rather than restated, so a column added to `recipes` is
 * exported the day it is added. `userId` is left out because a portable recipe is a catalog recipe
 * — nobody owns it, on either deployment. The two image ids are replaced by `images` below, which
 * spells the rows they point at.
 */
const { userId: _userId, coverImageId: _coverImageId, plateImageId: _plateImageId, ...portableRowFields } =
  recipes.validator.fields;

/**
 * One catalog recipe as `catalog:export` writes it and `catalog:restore` reads it — the whole row,
 * plus everything its ids point at, spelled without ids.
 *
 * `ingredients` carries each catalog ingredient's `slug`, `name` and `aliases` instead of its id,
 * because ids do not survive a deployment: the restore matches them against its own catalog.
 *
 * An image is only its URL: dimensions, mime type and hash are recomputed by the upload from the
 * bytes, and the key names a bucket. The plate travels with the URL of the base render it was cut
 * from and the offset it sits at, which is what `uploadMany` takes to rebuild the pair. On the
 * server the URLs are the exporting deployment's; the export script downloads the bytes into the
 * recipe's folder in the zip and rewrites each URL to the file's name there.
 *
 * `row` includes `search`, the six facets and `shuffleKey` as exported, but the restore recomputes
 * all three rather than writing them: `search` has one writer (ADR 0011), the facets follow `tags`
 * (ADR 0015), and a shuffle key that matched across deployments would order both catalogs alike.
 */
export const vPortableRecipe = v.object({
  /**
   * Where the recipe came from. `recipeId` is a string, not `v.id("recipes")`: it is an id of the
   * EXPORTING deployment, and a `v.id` validator on the restore's arguments would reject every one
   * as not an id of this deployment. Nothing dereferences it; the restore keys its ledger on it.
   */
  origin: v.object({ recipeId: v.string(), creationTime: v.number() }),
  row: v.object(portableRowFields),
  ingredients: v.array(
    v.object({
      position: v.number(),
      quantity: v.number(),
      unit: vUnit,
      ingredient: v.object({
        slug: v.optional(v.string()),
        name: vLocalized,
        aliases: v.optional(vLocalizedList),
      }),
    }),
  ),
  images: v.object({
    cover: v.optional(v.object({ url: v.string() })),
    plate: v.optional(
      v.object({ url: v.string(), base: v.object({ url: v.string() }), x: v.number(), y: v.number() }),
    ),
  }),
});

export type PortableRecipe = Infer<typeof vPortableRecipe>;
