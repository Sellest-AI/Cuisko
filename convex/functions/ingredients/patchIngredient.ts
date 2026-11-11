import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { TracedMutationCtx } from "@convex/procedures";
import { isRatioField, type IngredientPatch, type RepairableField } from "@convex/schema/ingredientPayloads";

import { nutriScoreOf } from "./ingredientRow";
import { fieldValue } from "./missingFields";

type PatchOptions = {
  /** A repair ran: stamp `repairedAt` with now, whatever was written. A stamp, not a fact found. */
  repaired?: boolean;
};

/**
 * A partial update of a catalog row: the fields the patch names that the row still lacks, and
 * nothing else. A field already set is never replaced — the only caller fills gaps, and a set
 * figure may be a measured one.
 *
 * The patch is flat and the row is not. The weights are top-level and written as they are; the
 * nutrients are merged into the row's current `nutrition`, because `db.patch` stores a nested
 * object whole, and `nutrition: { sodium }` would erase the calories, protein, fat and
 * carbohydrates. The Nutri-Score is derived again from the merged nutrition (ADR 0011).
 *
 * The row is read here, not trusted from the caller: another write may have filled a field since
 * the caller read it, and that field must then be kept.
 *
 * A fact written moves `updatedAt` and changes what every recipe using the row weighs and scores,
 * so it schedules the refresh of those recipes. A patch that wrote nothing does neither.
 *
 * @limitation A save that repairs eight rows refreshes its own recipe eight times, one refresh per
 * patched row, and seven of them write nothing. **Accepted because** each costs a few reads and no
 * write (`refreshRecipe` writes only a change), while the fixes cost more: a shared "refresh
 * pending" mark makes concurrent repairs conflict. **Until fixed**, the extra refreshes are reads.
 * **The fix** is one repair job per save, which patches every row and refreshes once — a recipe-level
 * fan-out, worth it only once the reads show on the usage page.
 */
export const patchIngredient = async (
  ctx: TracedMutationCtx,
  ingredientId: Id<"ingredients">,
  fields: IngredientPatch,
  { repaired = false }: PatchOptions = {},
): Promise<{ written: RepairableField[] }> => {
  const row = await ctx.db.get(ingredientId);
  if (!row) return { written: [] };

  const written = (Object.keys(fields) as RepairableField[]).filter(
    (field) => fields[field] !== undefined && fieldValue(row, field) === undefined,
  );
  if (!written.length && !repaired) return { written };

  const now = Date.now();
  const ratios = written.filter(isRatioField);
  const nutrients = written.filter((field) => !isRatioField(field));
  const nutrition = {
    ...row.nutrition,
    ...Object.fromEntries(nutrients.map((field) => [field, fields[field]])),
  };

  await ctx.db.patch(ingredientId, {
    ...Object.fromEntries(ratios.map((field) => [field, fields[field]])),
    ...(nutrients.length && { nutrition, nutriScore: nutriScoreOf(nutrition, row.category) }),
    ...(repaired && { repairedAt: now }),
    ...(written.length && { updatedAt: now }),
  });

  if (written.length)
    await ctx.scheduleTracedAfter(0, internal.router.recipes.refreshUsing._internal, {
      ingredientId,
      cursor: null,
    });

  return { written };
};
