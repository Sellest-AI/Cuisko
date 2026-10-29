import type { Id } from "@convex/_generated/dataModel";
import { hashText, setTranslation } from "@convex/lib/i18n";
import type { Localized, TranslationStatus } from "@convex/schema/i18n";
import type { RecipeEditor } from "@convex/schema/recipePayloads";
import type { RecipeStatus } from "@convex/schema/recipes";
import type { MutationCtx } from "@convex/procedures";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { Locale } from "@shared/translations";
import { serializeInstructions } from "@shared/recipes";

import { assertUnchangedSince } from "./assertUnchangedSince";
import { deriveRecipeFields } from "./deriveRecipeFields";
import { mergeDuplicateLinks } from "./mergeDuplicateLinks";
import { rewriteRecipeContent } from "./recipeContent";
import { recipeSearchText } from "./recipeSearchText";
import type { RecipeLink } from "./resolveRecipeIngredients";
import { syncRecipeLinks } from "./syncRecipeLinks";

type Args = {
  recipeId: Id<"recipes">;
  /** The language the cook edited in — the only field this run has fresh text for. */
  locale: Locale;
  recipe: SanitizedRecipe;
  /**
   * Whether `recipe` passed through the agent, or is the cook's own text carried straight through
   * unmodified — `updateOne` knows which, because it is the one that decided not to call it.
   * Decides `"machine"` versus `"edited"` below: text nobody analyzed is not machine-authored just
   * because it landed here through the same code path.
   */
  analyzed: boolean;
  /**
   * What the recipe's lines resolved to, already bought by the action that called this — every
   * line, not only the edited ones, because a mutation may not reach the catalog walk that
   * answers them.
   */
  links: RecipeLink[];
  /**
   * Whether `links` is the whole answer. False when a walk threw or a cap dropped a name — see
   * `ResolvedLinks`. The rewrite below is skipped entirely when it is false, because this function
   * replaces the row's links wholesale and cannot tell a line the resolver REFUSED from one it
   * never got to.
   */
  complete: boolean;
  /** Who is rewriting it, which decides its `status` — see `vRecipeEditor`. */
  editor: RecipeEditor;
};

/**
 * The status a rewrite leaves behind — the transitions `recipes.status` describes. A verify always
 * ends `reviewed`; a cook's edit of a `generated` recipe fixes what the model wrote, and any other
 * is theirs.
 */
const _statusAfter = (current: RecipeStatus, { by }: RecipeEditor): RecipeStatus =>
  by === "verifier" || current === "generated" ? "reviewed" : "edited";

/**
 * A re-sanitized recipe patched onto the row it came from, rather than a new one.
 *
 * `saveRecipe`'s insert with the identity swapped for a patch, and that is the whole of the
 * difference: the model was handed the row's own content as `outdated` context, so `recipe` here
 * is a revision of it, not a fresh generation, and `deriveRecipeFields` recomputes exactly the same
 * three things a create does — nothing here may special-case an edit's derived fields, or the two
 * paths could disagree about what a recipe's own tags are.
 */
export const updateRecipe = async (
  ctx: MutationCtx,
  { recipeId, locale, recipe, analyzed, links, complete, editor }: Args,
) => {
  const existing = await ctx.db.get(recipeId);
  if (!existing) throw new Error(`updateRecipe: recipe ${recipeId} does not exist.`);
  if (editor.by === "verifier")
    await assertUnchangedSince(ctx, { recipe: existing, locale, fingerprint: editor.fingerprint });

  const old = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
    .collect();

  const oldLinks = old.map((row) => ({
    ingredientId: row.ingredientId,
    position: row.position,
    quantity: row.quantity,
    unit: row.unit,
    ...(row.fatUse && { fatUse: row.fatUse }),
  }));

  /**
   * The links this write actually uses — the new ones, or the row's existing ones when the resolve
   * came back incomplete.
   *
   * ⚠️ The substitution happens HERE, above everything derived, and that is the whole point.
   *    `resolveRecipeIngredients` settles rather than throws, so a walk that failed on a live API
   *    or a model timeout returns a SHORT list indistinguishable from a recipe with fewer
   *    ingredients. Guarding only the join-table rewrite below would still let `tags`, `facets` and
   *    `search` be recomputed from that short list — and `computeTags` returns NO tags at all when
   *    a line did not resolve, so the recipe would lose every diet and allergen tag anyway, from a
   *    blip in a service that has nothing to do with it.
   *
   *    Keeping the previous links is the safe failure: stale is recoverable by editing again,
   *    deleted is not. A refusal does not set this — that is a decision about the line, and it
   *    applies.
   *
   * ⚠️ And it is a failure, not a fix. A recipe's ingredient list lives ONLY in `recipeIngredients`
   *    — `loadRecipe` builds it from nothing else — so on this path the cook's edited ingredients
   *    are not written at all, while their title, description and instructions are, and the save
   *    still reports success. Silently keeping the old list beats silently deleting it, which is
   *    why it is here; what neither does is tell the cook. The real answer is for `updateOne` to
   *    surface an incomplete resolve rather than swallow it, and that needs a screen to surface it
   *    to.
   */
  // Only a complete resolve is written, so only its links are worth the reads a merge costs.
  const merged = complete ? await mergeDuplicateLinks(ctx, { links, lineCount: recipe.ingredients.length }) : undefined;
  const resolved = merged ? merged.links : oldLinks;

  /**
   * The serving count `resolved` is stated for — written to the row AND handed to the tags, so the
   * two can never disagree about how many people the stored quantities feed.
   *
   * A complete resolve is the edit's own, so it is the edit's count. An incomplete one keeps the
   * row's links, and then it turns on whether the edit changed the amounts those links hold:
   *
   *   - **Same amounts.** A cook who cooked it for 3, found it fed 4, and changed only the number.
   *     The kept links ARE this edit's amounts, so the new count applies and every per-serving
   *     figure — calories, `high-calorie` — drops with it.
   *   - **Different amounts.** The edit's quantities are not written on this path, so its count
   *     would describe amounts the row does not hold: a recipe scaled from 2 to 4 would store the
   *     old amounts as feeding 4 and halve every figure. The previous count stays with them.
   *
   * Compared by position, quantity and unit, and never by name. A stored row holds a catalog id,
   * and the only name it can be read back as is the catalog's — `Oignon jaune` against the cook's
   * `oignon` — so a name comparison would call every recipe edited. `position` is the line's index
   * in `recipe.ingredients`, which is what makes the lookup below line up.
   */
  const amountsKept = old.every((row) => {
    const line = recipe.ingredients[row.position];
    return line !== undefined && line.quantity === row.quantity && line.unit === row.unit;
  });
  const servings = complete || amountsKept ? recipe.servings : existing.servings;

  // `lineCount` travels WITH `resolved` too: an incomplete resolve keeps the previous links, so the
  // count it answers for is their own and not the edited recipe's — holding three old links against
  // a four-line edit reads as an unresolved line and wipes every tag.
  const { tags, facets } = await deriveRecipeFields(ctx, {
    tags: recipe.tags,
    servings,
    links: resolved,
    lineCount: merged ? merged.lineCount : resolved.length,
  });

  // ADR 0011: the serializer is called HERE, where `search` is assigned — see `saveRecipe`.
  const search = await recipeSearchText(ctx, {
    ingredientIds: resolved.map((link) => link.ingredientId),
    names: recipe.ingredients.map((line) => line.name),
  });

  /**
   * Folded onto the EXISTING field rather than built fresh, unlike `saveRecipe`'s `_machine`: a
   * recipe already translated into the cook's other language would otherwise lose that language
   * the moment it is edited in this one. `setTranslation` only ever touches the one locale it is
   * given.
   */
  const status: TranslationStatus = analyzed ? "machine" : "edited";
  const _rewrite = (field: Localized, value: string): Localized =>
    setTranslation(field, locale, value, status, hashText(value));

  await rewriteRecipeContent(ctx, existing, (text) => ({
    description: _rewrite(text.description, recipe.description),
    instructions: _rewrite(text.instructions, serializeInstructions(recipe.instructions)),
  }));

  await ctx.db.patch(recipeId, {
    title: _rewrite(existing.title, recipe.title),
    servings,
    equipments: recipe.equipments,
    difficulty: recipe.difficulty,
    tags,
    ...facets,
    search,
    cuisine: recipe.cuisine,
    timings: recipe.timings,
    // Read from the row inside the mutation, so two saves racing each other cannot both see `generated`.
    status: _statusAfter(existing.status, editor),
    updatedAt: Date.now(),
  });

  /**
   * Writes only the rows that changed: a title-only edit resolves to the same links and touches
   * none of them. An incomplete resolve is already handled above: `resolved` is then the row's own
   * links, so every row matches and nothing is written.
   */
  await syncRecipeLinks(ctx, { recipeId, rows: old, links: resolved });

  return recipeId;
};
