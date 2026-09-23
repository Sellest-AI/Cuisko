import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { DEFAULT_LOCALE } from "@convex/schema/i18n";
import { ALIAS_EXACT } from "@shared/ingredientMatch";
import type { IngredientSource } from "@shared/ingredients";

import { ingredientRow, type IngredientFacts } from "./ingredientRow";
import { searchWidened, type WidenedCandidate } from "./searchWidened";

/**
 * An exact hit on a row's name (1) or on one of its aliases (`ALIAS_EXACT`), once both are folded —
 * and nothing fuzzy, which `FUZZY_CEILING` keeps below this. The question here is "is this food
 * already a row", not "is it close to one": `coriandre` against `Coriandre en poudre` is exactly the
 * pair that must stay apart, while `coriandre` against the row that lists it as an alias is not.
 */
const SAME_NAME = ALIAS_EXACT;

export type CreatedIngredient =
  | { created: true; ingredientId: Id<"ingredients"> }
  | { created: false; existing: WidenedCandidate };

/**
 * A catalog row grown from a shopper's own typing — the cook's path into `ingredients`.
 *
 * The second legitimate writer of this table, beside `seedIngredients`, and like it it shapes none
 * of its own row: every field, `search` and `nutriScore` included, comes from `ingredientRow`
 * (ADR 0011).
 *
 * **It re-runs step 1's search before it inserts, and that is the dedup.** `resolveIngredient` only
 * gets here once `searchWidened` found nothing — but it searched when the walk STARTED, seconds and
 * a model call ago. Two walks for the same food, running in parallel through a recipe import, both
 * searched before either wrote, and the catalog grew two `coriandre` rows eight seconds apart. The
 * same search, repeated here with the row's own name, sees the row the other walk wrote.
 *
 * Here and not at the end of the action, because a mutation is a transaction: the search is part
 * of its read set, so a concurrent insert that would have matched it conflicts and the mutation
 * retries — at which point it finds the row. In the action the same check only narrows the window.
 *
 * Only an exact name or alias (`SAME_NAME`) is reused. Two names for one food — `courgette` and
 * `zucchini`, both unknown — still produce two rows; nothing at write time can tell those apart.
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
): Promise<CreatedIngredient> => {
  // Only the name in the shopper's language, never the renderings beside it. English folds what
  // French keeps apart: a new `Poitrine fumée` rendered "Bacon" would otherwise land on the seeded
  // `Lard fumé`, whose English name is also "Bacon". The source name is also the one a parallel
  // walk for the same word produced, so it is all the race needs. `searchWidened` still reads both
  // indexes, and names the row in `locale`.
  const locale = facts.sourceLocale ?? DEFAULT_LOCALE;
  const [best] = await searchWidened(ctx, { text: facts.names[locale].value, locale });
  if (best && best.score >= SAME_NAME) return { created: false, existing: best };

  const ingredientId = await ctx.db.insert("ingredients", {
    ...ingredientRow(facts, source),
    updatedAt: Date.now(),
  });

  return { created: true, ingredientId };
};
