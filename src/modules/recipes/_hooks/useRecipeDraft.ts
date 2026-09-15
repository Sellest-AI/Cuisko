import { useLocale } from "~/hooks/useLocale";
import { api, type Id } from "~/lib/convex/api";
import { useQueryCached } from "~/lib/convex/client";

/**
 * A recipe as it was authored, for the editor to open back up on.
 *
 * Deliberately not `useRecipe`: that hook hands back the recipe SCALED to whatever the cook last
 * chose to cook it for, via a servings choice held in a module-wide atom that has nothing to do
 * with this recipe's own stored `servings`. The editor has to reopen on the recipe as it is
 * written — scaled quantities re-sanitized back into the row would silently rewrite a recipe for
 * four into one for whatever number a different screen was last showing.
 *
 * Same query as `useRecipe`, same skip-on-no-id shape, because both are `getOne.authed` and Convex
 * deduplicates the subscription — opening the editor on a recipe already open elsewhere costs
 * nothing extra.
 *
 * **The editor's guard lives here.** The read is open to any signed-in cook (ADR 0014), so the
 * query answering is no longer proof the recipe is the caller's to edit. A recipe that arrives
 * with `isOwned` false is folded into `isMissing`: a crafted `/recipe/edit/[foreignId]` gets the
 * missing state, not a form whose save `updateOne` would refuse anyway. The real gate is that
 * refusal; this one spares the cook a form they cannot submit.
 */
export const useRecipeDraft = (id: string | undefined) => {
  const locale = useLocale();

  const query = useQueryCached(
    api.router.recipes.getOne.authed,
    id ? { id: id as Id<"recipes">, locale } : "skip",
  );

  const isForeign = query.data !== undefined && query.data.isOwned !== true;

  return {
    recipe: isForeign ? undefined : query.data,
    isLoading: Boolean(id) && query.data === undefined && query.error === undefined,
    isMissing: !id || query.error !== undefined || isForeign,
  };
};
