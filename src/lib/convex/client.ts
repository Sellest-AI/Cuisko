import { makeUseQueryWithStatus } from "convex-helpers/react";
import { useQueries } from "convex-helpers/react/cache";
import { getFunctionName, type FunctionReference } from "convex/server";
import { useAction as useConvexAction, useMutation as useConvexMutation, type OptionalRestArgsOrSkip } from "convex/react";
import { atom, useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuthenticated } from "./session";
import { deleteDevice, deviceKey, readDevice, writeDevice } from "./deviceCache";

/**
 * Convex bindings, wrapped once so no call site hand-rolls loading state.
 *
 * Only a module's `_hooks/` folder may import this. Screens call a module hook (ADR 0006, R4).
 */
export * from "./api";

export { useQuery } from "convex-helpers/react";
export { useConvex, usePaginatedQuery } from "convex/react";
export { usePaginatedQuery as usePaginatedQueryCached } from "convex-helpers/react/cache";

/**
 * The query hook to reach for by default.
 *
 * Two things over raw `useQuery`: a discriminated `{ status, data, error }` result instead of
 * `undefined`-means-loading, and a cache that survives unmount — which is what stops every tab
 * switch from re-fetching and flashing a spinner at content the user just looked at.
 *
 * Gone on a cold start, and empty with no signal. A query a screen allowed offline draws on open
 * (`OFFLINE_ROUTES`, module `network`) takes `useQueryDevice` instead.
 */
export const useQueryCached = makeUseQueryWithStatus(useQueries);

type QueryStatus<Query extends FunctionReference<"query">> = ReturnType<typeof useQueryCached<Query>>;

/**
 * Keeps the last value while the next one loads. `"skip"` is not a slower answer, it is the absence
 * of a question — there is nothing to hold.
 */
const useHold = <Query extends FunctionReference<"query">>(
  result: QueryStatus<Query>,
  isSkipped: boolean,
  isOn = true,
) => {
  const [held, setHeld] = useState<Query["_returnType"] | undefined>(undefined);

  // Set while rendering, React's pattern for a value that follows the previous render's: it redraws
  // at once, before anything is committed.
  const next = isSkipped || !isOn ? undefined : (result.data ?? held);
  if (next !== held) setHeld(next);

  const data = result.data ?? next;

  return { ...result, data, isStale: result.data === undefined && data !== undefined };
};

/**
 * `useQueryCached`, but the last result stays on screen while the next one loads.
 *
 * The cache behind `useQueryCached` is keyed on the arguments, so a query whose arguments change
 * has no entry to serve and reports `undefined` until the round trip lands. For a query whose
 * arguments change *as a consequence of what the user just did* — a search box, a list keyed on
 * the ids currently rendered — that reads as the content vanishing and coming back.
 *
 * Holding the previous value is only honest when the next one is a refinement of it rather than a
 * different subject. `isStale` says which is on screen, so a caller that must not show the old
 * answer can still tell. A `"skip"`ped query holds nothing: skipping means there is no subject.
 */
export const useQueryHeld = <Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
) => useHold(useQueryCached(query, ...args), args[0] === "skip");

export type DeviceOptions<Query extends FunctionReference<"query">> = {
  /**
   * Args left out of the entry's key: the stored answer is served when the other args match,
   * whatever these were. For a window that moves (yesterday's week still holds today's meals) or an
   * id list that grows, never for what says whose data it is (`householdId`, `locale`).
   */
  loose?: readonly (keyof Query["_args"] & string)[];
  /** Keep the last value while the next one loads, as `useQueryHeld` does (`isStale`). */
  hold?: boolean;
};

/**
 * `useQueryCached`, with its last answer kept on the device: a cold start draws it before any round
 * trip, and draws it with no signal at all. The device copy is served until the first live answer,
 * which replaces it and is written through; `isFromDevice` says which is on screen.
 *
 * The caller's `"skip"` says whether there is a subject: a stored session is enough, since reading
 * the device sends nothing. This hook decides whether the server can be asked yet: an `authed`
 * subscription opens only once Convex has confirmed the token, or it reaches the server early and is
 * rejected. An `anon` one needs no token, and opens at once. A live error drops the entry, so a
 * household left or a row gone does not come back from the device next start.
 */
export const useQueryDevice = <Query extends FunctionReference<"query">>(
  query: Query,
  args: Query["_args"] | "skip",
  { loose, hold = false }: DeviceOptions<Query> = {},
) => {
  const { isAuthenticated } = useAuthenticated();
  const canAsk = isAuthenticated || getFunctionName(query).endsWith(":anon");
  const live = useQueryCached(
    query,
    ...((args === "skip" || !canAsk ? ["skip"] : [args]) as OptionalRestArgsOrSkip<Query>),
  );
  const key = args === "skip" ? undefined : deviceKey(query, args, loose);

  // Read only while the live answer is missing, and again each time it goes missing, so an entry
  // this hook just wrote or deleted is not served from a read before it.
  const stored = useMemo(
    () => (key && live.status === "pending" ? readDevice(key) : undefined),
    [key, live.status],
  );

  useEffect(() => {
    if (!key) return;
    if (live.status === "success") writeDevice(key, { data: live.data });
    if (live.status === "error") deleteDevice(key);
  }, [key, live.status, live.data]);

  const isFromDevice = live.status === "pending" && stored !== undefined;
  const result: QueryStatus<Query> = isFromDevice
    ? { status: "success", data: stored.data as Query["_returnType"], error: undefined, isSuccess: true, isPending: false, isError: false }
    : live;

  return { ...useHold(result, args === "skip", hold), isFromDevice };
};

/**
 * Adds `{ isLoading, isSuccess, isError }` around a bare Convex call.
 *
 * Generic over the full argument tuple rather than a single args object, which is what lets it
 * wrap mutations and actions alike — Convex types those as `(...args: OptionalRestArgs<F>)`, so
 * anything assuming one parameter fails to typecheck the moment a procedure takes none.
 *
 * It rethrows. Loading state is a UI concern and belongs here; deciding what a failure *means*
 * is the caller's, and swallowing it here would make that impossible.
 */
const useWithLoader = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);

  const execute = useCallback(
    async (...args: A): Promise<R> => {
      setIsLoading(true);
      try {
        const result = await fn(...args);
        setIsSuccess(true);
        setIsError(false);
        return result;
      } catch (error) {
        setIsError(true);
        setIsSuccess(false);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [fn],
  );

  return { execute, isLoading, isSuccess, isError };
};

type MutationPath = Parameters<typeof useConvexMutation>[0];
type MutationFn<T extends MutationPath> = ReturnType<typeof useConvexMutation<T>>;

export const useMutation = <T extends MutationPath>(path: T) => {
  const mutate = useConvexMutation(path);
  const { execute, isLoading, isSuccess, isError } = useWithLoader(mutate);

  // `execute` widens the argument tuple through the generic; casting back to the generated
  // mutation signature restores per-procedure argument checking at the call site.
  return { mutate: execute as MutationFn<T>, isLoading, isSuccess, isError };
};

type ActionPath = Parameters<typeof useConvexAction>[0];
type ActionFn<T extends ActionPath> = ReturnType<typeof useConvexAction<T>>;

export const useAction = <T extends ActionPath>(path: T) => {
  const act = useConvexAction(path);
  const { execute, isLoading, isSuccess, isError } = useWithLoader(act);

  return { action: execute as ActionFn<T>, isLoading, isSuccess, isError };
};

/**
 * A cache for **action** results.
 *
 * Queries are reactive and cached by Convex; actions are neither — they are one-shot calls that
 * re-run on every mount. This keeps the last result per (key, args) pair so a screen returning
 * from navigation shows data immediately while `reload()` refreshes it.
 */
const cachedAtom = atom<Record<string, unknown>>({});

type CachedParams<T extends ActionPath> = T["_args"] & { key: string };

export const useQueryCachedData = <T extends ActionPath>(path: T, params: CachedParams<T>) => {
  const { key, ...actionParams } = params;
  const act = useConvexAction(path);
  const { execute, isLoading, isSuccess, isError } = useWithLoader(act);
  const [cached, setCached] = useAtom(cachedAtom);

  // Keys are sorted so the same arguments in a different order hit the same entry.
  const cacheKey = useMemo(
    () => `${key}:${JSON.stringify(actionParams, Object.keys(actionParams ?? {}).sort())}`,
    [key, actionParams],
  );

  type Result = Awaited<ReturnType<ActionFn<T>>>;
  const [data, setData] = useState<Result | undefined>(cached[cacheKey] as Result | undefined);

  const reload = useCallback(async () => {
    const result = (await execute(actionParams as T["_args"])) as Result;
    setData(result);
    setCached((prev) => ({ ...prev, [cacheKey]: result }));
    return result;
  }, [execute, actionParams, cacheKey, setCached]);

  useEffect(() => {
    // `cancelled` is not just tidiness: without it a slow response for a previous cacheKey can
    // land after the arguments changed and overwrite the newer result.
    let cancelled = false;

    execute(actionParams as T["_args"])
      .then((result) => {
        if (cancelled) return;
        setData(result as Result);
        setCached((prev) => ({ ...prev, [cacheKey]: result }));
      })
      .catch((error: unknown) => {
        // `isError` is already set by useWithLoader; this exists so a failure is never silent.
        if (__DEV__) console.warn("[useQueryCachedData] action failed", error);
      });

    return () => {
      cancelled = true;
    };
    // Deliberately keyed on cacheKey alone: the other values are recreated every render, so
    // depending on them would re-run the action forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { data, isLoading, isSuccess, isError, reload };
};
