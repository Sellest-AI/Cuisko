import { useAtom } from "jotai";
import { useCallback } from "react";

import { pendingIngredientsAtom } from "./atoms";
import type { PendingFailure, PendingIngredient } from "../_model/model";

/** Enough for a list that only ever holds a handful of live ghosts. */
const _mintId = () => `pending:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

/**
 * The placeholder card's lifecycle: up on the gesture, then down, or turned into a failure.
 *
 * What the card is waiting for is the caller's: `usePendingIngredients` waits on a resolve and a
 * write, `useProductActions` on a write alone. Both draw the same card and fail the same way.
 */
export const useGhosts = () => {
  const [pending, setPending] = useAtom(pendingIngredientsAtom);

  const raise = useCallback(
    (ghost: Omit<PendingIngredient, "id" | "state">) => {
      const id = _mintId();
      setPending((ghosts) => [...ghosts, { ...ghost, id, state: "resolving" }]);

      return id;
    },
    [setPending],
  );

  const drop = useCallback(
    (id: string) => setPending((ghosts) => ghosts.filter((ghost) => ghost.id !== id)),
    [setPending],
  );

  const fail = useCallback(
    (id: string, reason: PendingFailure) =>
      setPending((ghosts) =>
        ghosts.map((ghost) =>
          ghost.id === id ? { ...ghost, state: "failed" as const, reason } : ghost,
        ),
      ),
    [setPending],
  );

  return { pending, raise, drop, fail };
};
