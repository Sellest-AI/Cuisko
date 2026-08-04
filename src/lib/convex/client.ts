import { makeUseQueryWithStatus } from "convex-helpers/react";
import { useQueries } from "convex-helpers/react/cache";
import { useAction as useConvexAction, useMutation as useConvexMutation } from "convex/react";
import { atom, useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";

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
 */
export const useQueryCached = makeUseQueryWithStatus(useQueries);

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
