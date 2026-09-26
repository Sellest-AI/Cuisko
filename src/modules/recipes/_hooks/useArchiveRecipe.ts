import { router } from "expo-router";
import { useCallback, useState } from "react";

import { api, type Id } from "~/lib/convex/api";
import { useMutation } from "~/lib/convex/client";

/**
 * Deleting a recipe from its editor, which archives it (`router/recipes/archiveOne`).
 *
 * It leaves for the recipes list on success rather than going back: the screen behind the editor
 * is the recipe's own page, and landing a cook on the recipe they just deleted reads as the delete
 * not having worked. `dismissTo` unwinds to the list when it is in the stack and replaces with it
 * when the editor was reached some other way.
 *
 * A rejected write is held in `error` rather than thrown, for the reason `useSetRecipeFavorite`
 * gives: the button is wired to `onPress`, which drops what the handler returns.
 */
export const useArchiveRecipe = () => {
  const { mutate, isLoading } = useMutation(api.router.recipes.archiveOne.authed);
  const [error, setError] = useState<Error | null>(null);

  const archive = useCallback(
    async (id: Id<"recipes">) => {
      try {
        setError(null);
        await mutate({ id });
        router.dismissTo("/recipes");
      } catch (cause) {
        console.error("[recipes] archive failed", cause);
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    },
    [mutate],
  );

  return { archive, isArchiving: isLoading, error };
};
