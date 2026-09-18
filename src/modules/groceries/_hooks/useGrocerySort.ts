import { useAtom } from "jotai";

import { sortAtom } from "./atoms";

/**
 * The way "To Buy" is being read, and the setter.
 *
 * Two callers: the grid's selector, which reads and writes it, and the navigation bar, which only
 * ever writes `"standard"` — on an add, so the new card lands on the plain list where the shopper
 * will look for it. Re-exported from `hooks.ts` for that second caller.
 */
export const useGrocerySort = () => {
  const [sort, setSort] = useAtom(sortAtom);

  return { sort, setSort };
};
