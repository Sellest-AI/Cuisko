import { useCallback, useMemo, useState } from "react";
import { ConvexError } from "convex/values";

import { api, type Id } from "~/lib/convex/api";
import { useAuthenticated } from "~/lib/convex/auth";
import { useMutation, useQueryCached } from "~/lib/convex/client";

/** One household as the account screen draws it: `getMine`'s projection, renamed for the card. */
export type HouseholdSummary = {
  id: Id<"households">;
  name: string;
  code: string;
  /** Computed by the server, never here (ADR 0015). */
  memberSeeds: string[];
};

/** Why the last code did not let the cook in: nobody holds it, or the call itself failed. */
export type JoinError = "not_found" | "failed";

/** Failures the screen has nothing to say about still deserve a line while developing. */
const _warn = (what: string) => (cause: unknown) => {
  if (__DEV__) console.warn(`[useHouseholds] ${what} failed`, cause);
};

/**
 * Every household the cook belongs to, which one they are shopping for, and the ways in and out.
 *
 * Reads the same cached `getMine` as `useHousehold`, so opening the drawer costs no request. The
 * mutations need no local bookkeeping: `getMine` is reactive, and the list redraws when they land.
 */
export const useHouseholds = () => {
  const { isAuthenticated } = useAuthenticated();

  /** `'skip'` is Convex's idiom for "not yet" — the hook call stays unconditional, the query unsent. */
  const { data, isPending } = useQueryCached(
    api.router.households.getMine.authed,
    isAuthenticated ? {} : "skip",
  );

  const { mutate: runCreate } = useMutation(api.router.households.create.authed);
  const { mutate: runJoin, isLoading: isJoining } = useMutation(api.router.households.join.authed);
  const { mutate: runLeave } = useMutation(api.router.households.leave.authed);
  const { mutate: runSelect } = useMutation(api.router.households.select.authed);

  const [joinError, setJoinError] = useState<JoinError | null>(null);

  const households = useMemo<HouseholdSummary[]>(
    () => (data ?? []).map((household) => ({
      id: household._id,
      name: household.name,
      code: household.inviteCode,
      memberSeeds: household.memberSeeds,
    })),
    [data],
  );

  /** Resolves true when the cook is in, so the screen only clears the field on success. */
  const join = useCallback(async (code: string): Promise<boolean> => {
    setJoinError(null);
    try {
      await runJoin({ code });
      return true;
    } catch (cause) {
      const isUnknownCode = cause instanceof ConvexError && cause.data?.code === "NOT_FOUND";
      setJoinError(isUnknownCode ? "not_found" : "failed");
      if (!isUnknownCode) _warn("join")(cause);
      return false;
    }
  }, [runJoin]);

  const create = useCallback(() => { runCreate({}).catch(_warn("create")); }, [runCreate]);

  const leave = useCallback(
    (id: Id<"households">) => { runLeave({ householdId: id }).catch(_warn("leave")); },
    [runLeave],
  );

  const select = useCallback(
    (id: Id<"households">) => { runSelect({ householdId: id }).catch(_warn("select")); },
    [runSelect],
  );

  return {
    households,
    currentId: data?.find((household) => household.isCurrent)?._id,
    isLoading: isAuthenticated && isPending,
    isJoining,
    joinError,
    select,
    leave,
    join,
    create,
  };
};
