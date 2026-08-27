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
 */
export const useRecipeDraft = (id: string | undefined) => {
  const locale = useLocale();

  const query = useQueryCached(
    api.router.recipes.getOne.authed,
    id ? { id: id as Id<"recipes">, locale } : "skip",
  );

  return {
    recipe: query.data,
    isLoading: Boolean(id) && query.data === undefined && query.error === undefined,
    isMissing: !id || query.error !== undefined,
  };
};
