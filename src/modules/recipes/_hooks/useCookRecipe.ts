import { useCallback, useState } from "react";

import { localClock } from "@shared/clock";

import { api, type Id } from "~/lib/convex/api";
import { useMutation } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

/**
 * The last tap of the step-by-step flow: the dish is cooked, and the app is told so.
 *
 * One mutation, and the server decides everything else — which plate this was, what the cellar
 * loses, what leaves the list. The hook sends what only the client knows: the servings the stepper
 * shows, and the clock where the cook is standing (`localClock`), read at the tap rather than at
 * mount because a long recipe can cross the dinner threshold while it is being cooked.
 *
 * A rejected write is held in `failed` rather than thrown, for the reason `useSetRecipeFavorite`
 * gives: the button is wired to `onPress`, which drops what the handler returns, so a throw would be
 * an unhandled rejection and the cook would be told nothing. `cook` resolves to whether it worked,
 * so the screen can close on success and stay put otherwise.
 */
export const useCookRecipe = () => {
  const { householdId } = useHousehold();
  const { mutate, isLoading } = useMutation(api.router.planning.cookOne.authed);
  const [failed, setFailed] = useState(false);

  const cook = useCallback(
    async (recipeId: string, servings: number): Promise<boolean> => {
      // No household resolved is a write that cannot be sent, and the cook is told so like any other refusal.
      if (!householdId) {
        setFailed(true);
        return false;
      }

      try {
        setFailed(false);
        await mutate({ householdId, recipeId: recipeId as Id<"recipes">, servings, ...localClock(new Date()) });
        return true;
      } catch (cause) {
        console.error("[recipes] cook write failed", cause);
        setFailed(true);
        return false;
      }
    },
    [householdId, mutate],
  );

  return { cook, isCooking: isLoading, failed };
};
