import { useCallback } from "react";

import { api, type Id } from "~/lib/convex/api";
import { useMutation } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

/**
 * The tap that takes one product off the list. One per card, so `isStriking` is that card's own.
 *
 * The card stays until the server has removed the row, and reactivity takes it away: a rejected write
 * only has to log, and the card is still there to tap again.
 */
export const useStrikeProduct = () => {
  const { householdId } = useHousehold();
  const { mutate: removeProduct, isLoading: isStriking } = useMutation(api.router.cellars.removeGroceryProduct.authed);

  const strike = useCallback(
    async (id: string) => {
      if (!householdId) return;

      try {
        await removeProduct({ householdId, productId: id as Id<"groceryProducts"> });
      } catch (cause) {
        console.error("[groceries] product strike failed", cause);
      }
    },
    [householdId, removeProduct],
  );

  return { strike, isStriking };
};
