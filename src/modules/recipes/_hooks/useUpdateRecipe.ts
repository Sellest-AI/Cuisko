import { router } from "expo-router";
import { useCallback, useState } from "react";
import type { FunctionArgs } from "convex/server";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useAction } from "~/lib/convex/client";

/** Everything the editor collected, plus which recipe it is rewriting. */
export type RecipeEdit = Omit<FunctionArgs<typeof api.router.recipes.updateOne.authed>, "locale">;

/** See `useCreateRecipe.Status` — the same three-and-one shape, for the same reason. */
type Status = "idle" | "updating" | "done" | "failed";

/**
 * Rewriting a recipe, and the wait that comes with it.
 *
 * `useCreateRecipe`'s sibling rather than a branch inside it: the two write to different actions
 * and navigate for different reasons on success. Folding this back into `useCreateRecipe` behind
 * an `if (recipeId)` would make one hook answer two questions, and the editor screen already knows
 * which of the two it means to ask.
 *
 * It navigates on success for the same reason `useCreateRecipe` does: `updateOne` schedules
 * nothing that still has to be waited on once the row is patched, so there is nothing left for the
 * editor to hold open for.
 */
export const useUpdateRecipe = () => {
  const locale = useLocale();
  const { action } = useAction(api.router.recipes.updateOne.authed);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<unknown>(null);

  const update = useCallback(
    async (edit: RecipeEdit) => {
      /** Same guard as `useCreateRecipe.create`, and for the same reason — see there. */
      if (status === "updating") return;

      setError(null);
      setStatus("updating");

      try {
        const recipeId = await action({ ...edit, locale });

        setStatus("done");
        router.replace(`/recipe/${recipeId}`);
      } catch (caught) {
        setError(caught);
        setStatus("failed");
      }
    },
    [action, locale, status],
  );

  return {
    update,
    isUpdating: status === "updating" || status === "done",
    error,
  };
};
