import { internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { repairIngredient as repairIngredientTool, type RepairIngredientInput } from "@convex/agent/tools/repairIngredient";
import type { TracedActionCtx } from "@convex/procedures";
import type { IngredientPatch, RatioField, RepairableField } from "@convex/schema/ingredientPayloads";
import { clampNutrientParts } from "@shared/nutrition";

import { stillMissing } from "./missingFields";

/**
 * The row's name in both languages. Every writer sets both (`ingredientRow`), so the fallback only
 * covers a row older than that rule: the model is shown the one name it has twice, rather than nothing.
 */
const _namesOf = ({ name: { values } }: Doc<"ingredients">) => {
  const fallback = values.fr ?? values.en ?? "";

  return { fr: values.fr ?? fallback, en: values.en ?? fallback };
};

/**
 * The answer's sugars and saturated fat, lowered to the row's carbohydrates and fat where they
 * exceed them (`clampNutrientParts`). Only the answered parts are checked: a part the row already
 * held is not this repair's to change, and `patchIngredient` would not write it anyway.
 */
const _consistent = (
  row: Doc<"ingredients">,
  { sugars, saturatedFat, ...rest }: IngredientPatch,
): { fields: IngredientPatch; contradicted: string[] } => {
  const { nutrition, clamped } = clampNutrientParts({
    carbohydrates: row.nutrition.carbohydrates,
    fat: row.nutrition.fat,
    ...(sugars !== undefined && { sugars }),
    ...(saturatedFat !== undefined && { saturatedFat }),
  });

  return {
    fields: {
      ...rest,
      ...(nutrition.sugars !== undefined && { sugars: nutrition.sugars }),
      ...(nutrition.saturatedFat !== undefined && { saturatedFat: nutrition.saturatedFat }),
    },
    contradicted: clamped,
  };
};

/** Lines shown per unit: enough for "30 pcs" to read as cubes, short enough for a row fifty recipes use. */
const USES_PER_UNIT = 3;

type IngredientUse = NonNullable<RepairIngredientInput["uses"]>[number];

/**
 * The lines the model is shown: the first few in each unit, so a unit only one recipe writes is
 * never crowded out by the forty that write another.
 */
const _shownUses = (uses: IngredientUse[]): IngredientUse[] => {
  const shown = new Map<string, IngredientUse[]>();
  for (const use of uses) {
    const inUnit = shown.get(use.unit) ?? [];
    if (inUnit.length < USES_PER_UNIT) shown.set(use.unit, [...inUnit, use]);
  }

  return [...shown.values()].flat();
};

type RepairArgs = {
  ingredientId: Id<"ingredients">;
  missing: RepairableField[];
};

type RepairResult = {
  /** The weights the model refused: "chicken has no density". */
  refused: RatioField[];
  /** The nutrients lowered because the row contradicts them, each with its answer and its bound. */
  contradicted: string[];
};

/**
 * One catalog row's missing fields, filled and written: the job a recipe save schedules for each
 * row that cannot yet give that recipe its nutrition or its Cui-Score.
 *
 * 1. The row is read again, and only the fields still missing are asked: another job may have
 *    filled them since the save. Nothing left → no call, and no `repairedAt`.
 * 2. One structured call, its schema built from the fields asked, shown how live recipes write the
 *    row: "1 pcs" of yogurt is a pot only to a model that sees the line.
 * 3. The consistency check: sugars and saturated fat lowered to the row's carbohydrates and fat.
 * 4. The patch, which writes only fields still unset, stamped `repaired` whatever it wrote.
 *
 * No lookup: the row was created by `resolveIngredient`, which already searched CIQUAL, Open Food
 * Facts and USDA, had Jev judge each result, and wrote every figure they measured. A field still
 * missing is one those sources did not hold, so searching them again buys nothing.
 *
 * Returns the weights the model refused, and the nutrients it lowered, for the entry point to
 * report: a refused weight is not written, so it is asked, and paid for, again; a lowered nutrient
 * is written, but rests on the row's own figure, which may be the wrong one. A refused weight, or a
 * job that failed, is not remembered: the next save that schedules repairs asks again — a create, or
 * an update whose ingredients changed (`updateRecipe` skips the others).
 */
export const repairIngredient = async (
  ctx: TracedActionCtx,
  { ingredientId, missing }: RepairArgs,
): Promise<RepairResult> => {
  const row = await ctx.runQuery(internal.router.ingredients.getIngredient._internal, { ingredientId });
  if (!row) return { refused: [], contradicted: [] };

  const asked = stillMissing(row, missing);
  if (!asked.length) return { refused: [], contradicted: [] };

  const uses = await ctx.runQuery(internal.router.ingredients.getUses._internal, { ingredientId });
  const { fields, refused } = await repairIngredientTool.run(ctx, {
    names: _namesOf(row),
    uses: _shownUses(uses),
    category: row.category,
    defaultUnit: row.defaultUnit,
    nutrition: row.nutrition,
    missing: asked,
  });

  const consistent = _consistent(row, fields);

  await ctx.runTracedMutation(internal.router.ingredients.updateOne._internal, {
    ingredientId,
    fields: consistent.fields,
    repaired: true,
  });

  return { refused, contradicted: consistent.contradicted };
};
