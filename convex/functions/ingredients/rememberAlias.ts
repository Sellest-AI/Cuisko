import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { withAlias } from "./ingredientRow";

/**
 * A word a shopper typed, written onto the row a model just said it meant — the third writer of
 * `ingredients`, and the only one that adds no row.
 *
 * **It exists to stop paying twice for the same answer.** `resolveIngredient`'s last step asks a
 * model whether a near-miss the catalog search declined is the same food, and that call fires on
 * every term the catalog cannot resolve. Nothing recorded the answer, so a shopper typing
 * `zucchini` at a `courgette` row bought the same judgement today, tomorrow and every time after
 * that. Stored here, the second attempt is answered by step 1 — no network, no model, no bill.
 *
 * **The ranker decides WHETHER, not this function.** `saveAlias` on the tool's `existing` verdict
 * is the judgement about the word — a regional spelling is worth keeping and `pxtates` is not —
 * and it is a judgement about language that no rule here could make from the string alone.
 *
 * **It patches `aliases` and `search` and nothing else, which is ADR 0011 read exactly.** `search`
 * is derived from `name` and `aliases`, so moving an alias obliges recomputing it — by `withAlias`,
 * in the module that owns every derived field of this table. `name` moved nothing, so it is not
 * rewritten: a row rebuilt whole would re-derive the hash a machine name was rendered against, and
 * that pivot is not stored.
 *
 * ⚠️ **`locale` is the shopper's UI LANGUAGE, not the language of the word they typed — and this is
 * the site where that proxy costs the most.** Nothing in the app detects the latter: `resolve.authed`
 * passes `ctx.i18n.locale`, and every step below it has read its own `locale` argument that way
 * since it was written. The same assumption is recorded on `IngredientFacts.sourceLocale`, so this
 * is consistent with the rest of the resolver rather than new — but the blast radius is different
 * there and worth writing down here.
 *
 * On a name, a wrong pivot mis-records one row's translation metadata. Here it files a word into a
 * SHARED SEARCH INDEX under the wrong language, and both halves of that are wasted:
 *
 * - The shoppers who would search that word never reach it. A French-UI shopper typing `zucchini`
 *   files it under `search.fr`, so the English shopper who types `zucchini` tomorrow pays the
 *   ranker call this function exists to save — the cache is populated in the one language whose
 *   readers will not ask for it.
 * - The shoppers who do read that index pay for carrying it. BM25 divides by field length, so a
 *   foreign token in `search.fr` slightly lowers that row's score for every French word anybody
 *   actually searches it by.
 *
 * **It is accepted rather than unnoticed, and it fails in the safe direction**: the shopper still
 * gets the right ingredient, and the only loss is a cache entry filed in the wrong drawer. The fix
 * is to detect the language of the typed word rather than assume the reader's — one or two words,
 * no context — which is its own slice, and would close this and `sourceLocale` together.
 *
 * Returns whether the row actually grew, which is what a test asserts on and what makes the two
 * silent paths below observable rather than inferred from a row that did not change.
 */
export const rememberAlias = async (
  ctx: MutationCtx,
  {
    ingredientId,
    alias,
    locale,
  }: { ingredientId: Id<"ingredients">; alias: string; locale: Locale },
): Promise<boolean> => {
  const doc = await ctx.db.get(ingredientId);

  // Not an error, and deliberately not a throw: the row was deleted between the model call and
  // here. The shopper still gets the ingredient they asked for, and the app pays for the ranker
  // again next time — the status quo this function improves on, not a failure of the resolve it
  // is a step of.
  if (!doc) return false;

  const grown = withAlias(doc, alias, locale);

  // The row already knows this word — under another casing, or because a second shopper typed it
  // while this one was waiting on the model. Patching anyway would bump `updatedAt` for no change.
  if (!grown) return false;

  await ctx.db.patch(ingredientId, { ...grown, updatedAt: Date.now() });

  return true;
};
