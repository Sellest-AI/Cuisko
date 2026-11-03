import { useCallback } from "react";

import type { Unit } from "@shared/ingredients";

import { api } from "~/lib/convex/api";
import { useMutation } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

import { useGhosts } from "./useGhosts";

/**
 * Putting a non-food product on the list.
 *
 * The failure draws itself, so this holds no `error`: a rejected add turns its ghost into the failed
 * card. Tapping one off is `useStrikeProduct`, which is per card.
 */
export const useProductActions = () => {
  const { householdId } = useHousehold();
  const { raise, drop, fail } = useGhosts();

  const { mutate: addProduct } = useMutation(api.router.cellars.addGroceryProduct.authed);

  /**
   * **Each half falls back alone, and `pickQuantity` is deliberately not used.** It takes the fallback
   * whenever either half is missing, which protects a food from its row's default unit (two *grams*
   * of gnocchi). A product's only default is `pcs`, where "2 shampoos" means 2, and it would store 1.
   */
  const add = useCallback(
    async (text: string, unit: Unit | null, amount: number | null) => {
      const name = text.trim();
      if (!name) return;

      const id = raise({ name, unit: unit ?? undefined, amount: amount ?? undefined, intent: "relist" });

      if (!householdId) {
        fail(id, "error");
        return;
      }

      try {
        await addProduct({ householdId, name, unit: unit ?? "pcs", quantity: amount ?? 1 });
      } catch (cause) {
        console.error("[groceries] product write failed", cause);
        fail(id, "error");
        return;
      }

      drop(id);
    },
    [householdId, raise, drop, fail, addProduct],
  );

  return { add };
};
