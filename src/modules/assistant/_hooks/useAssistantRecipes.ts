import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import type { Id } from "~/lib/convex/api";
import { useQuery } from "~/lib/convex/client";

/**
 * The recipes one assistant turn found, as cards.
 *
 * **The ids are all that was stored; the cards are resolved now.** `searchRecipes` writes ids into
 * its message and nothing else, so a recipe renamed, re-covered or newly translated since the
 * conversation happened is drawn as it is today rather than as a snapshot that quietly stops
 * matching the recipe it opens.
 *
 * The ids arrive as strings, because that is what survives a round trip through a stored tool
 * result — a message part is JSON, and `Id<"recipes">` is a branded string that the brand does not
 * survive. The cast is the one place that is acknowledged. It is safe in the direction that
 * matters: these ids were produced by `searchForUser` on the server, not composed by the model
 * (ADR 0010), and an id that has since been deleted is dropped by `loadRecipeCards` rather than
 * throwing.
 */
export const useAssistantRecipes = (recipeIds: string[]) => {
  const locale = useLocale();

  const found = useQuery(
    api.router.recipes.getMany.authed,
    recipeIds.length > 0 ? { ids: recipeIds as Id<"recipes">[], locale } : "skip",
  );

  return {
    recipes: found.data ?? [],
    /** Only the first load. A row already drawn must not blank while a newer answer resolves. */
    isLoading: recipeIds.length > 0 && found.data === undefined,
  };
};
