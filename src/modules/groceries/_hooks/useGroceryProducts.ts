import { useMemo } from "react";

import { api } from "~/lib/convex/api";
import { useQueryDevice } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

import { toProductRows } from "../_model/products";

const EMPTY: never[] = [];

/**
 * The household's non-food products, for the list and for Home's count.
 *
 * On the device like the rest of the list, which is read in the shop where the signal is worst.
 *
 * `isLoading` is scoped on `householdId`, as `useSnapshot`'s is: a skipped query reports itself as
 * pending, and a signed-in user with no household would otherwise load forever.
 */
export const useGroceryProducts = () => {
  const { householdId, isLoading: isResolvingHousehold } = useHousehold();
  const rows = useQueryDevice(api.router.cellars.getGroceryProducts.authed, householdId ? { householdId } : "skip");

  const products = useMemo(() => toProductRows(rows.data ?? EMPTY), [rows.data]);

  return { products, isLoading: isResolvingHousehold || (!!householdId && rows.isPending) };
};
