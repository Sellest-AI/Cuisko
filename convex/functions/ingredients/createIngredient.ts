import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { IngredientSource } from "@shared/ingredients";

import { ingredientRow, type IngredientFacts } from "./ingredientRow";

/**
 * A catalog row grown from a shopper's own typing — the cook's path into `ingredients`.
 *
 * The second legitimate writer of this table, beside `seedIngredients`, and like it it shapes none
 * of its own row: every field, `search` and `nutriScore` included, comes from `ingredientRow`
 * (ADR 0011). That is the whole reason this function is three lines — a writer's job is to have
 * facts and a provenance, and there is nothing else here to get wrong.
 *
 * **No `slug`, and no upsert.** A slug is the seed's dedup key and a row invented here has nothing
 * stable to key by, so there is no `by_slug` lookup to make this idempotent. What stops a duplicate
 * is upstream and cheaper: `resolveIngredient` searches the catalog widened, re-searches it with
 * every spelling the lookups know, and asks the agent to pick an existing row before it ever gets
 * here. Two shoppers typing the same unknown food at the same moment can still produce two rows —
 * that trade is recorded in this slice's plan, under "the ghost".
 *
 * `source` is the caller's to supply rather than hard-coded to `agent`, because the agent is the
 * step that decides a category and an allergen list and is often NOT the source of the numbers:
 * `measuredOver` lays CIQUAL's protein back over the model's, and `provenanceOf` is what reads the
 * resulting row's real provenance off the hits.
 */
export const createIngredient = async (
  ctx: MutationCtx,
  facts: IngredientFacts,
  source: IngredientSource,
): Promise<Id<"ingredients">> =>
  ctx.db.insert("ingredients", { ...ingredientRow(facts, source), updatedAt: Date.now() });
