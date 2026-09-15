import { useCallback, useState } from "react";

import { api, type Id } from "~/lib/convex/api";
import { useMutation } from "~/lib/convex/client";

/**
 * The heart on the recipe screen.
 *
 * A mutation and nothing else: no optimistic state, no local copy of what was pressed. The recipe
 * screen already subscribes to `getOne`, whose payload carries `isFavorited`, and Convex pushes
 * the new payload within a tick of the write — so the heart fills from the same source of truth
 * every other reader sees, and cannot disagree with it.
 *
 * `set` takes the state wanted rather than toggling. The caller reads `isFavorited` off its
 * payload and sends the opposite; two taps before that payload catches up both send the same
 * value and the server converges on it. A toggle would have undone the first tap with the second.
 * The server side of the same decision is in `convex/functions/recipes/setFavorite.ts`.
 *
 * A rejected write is held in `error` rather than thrown, for the reason `useStockActions` gives:
 * the heart is wired to `onPress`, which drops what the handler returns, so a throw would be an
 * unhandled rejection and the cook would be told nothing. The heart simply does not fill.
 */
export const useSetRecipeFavorite = () => {
  const { mutate, isLoading } = useMutation(api.router.recipes.setFavorite.authed);
  const [error, setError] = useState<Error | null>(null);

  const set = useCallback(
    async (id: Id<"recipes">, liked: boolean) => {
      try {
        setError(null);
        await mutate({ id, liked });
      } catch (cause) {
        console.error("[recipes] favorite write failed", cause);
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    },
    [mutate],
  );

  return { set, isSetting: isLoading, error };
};
