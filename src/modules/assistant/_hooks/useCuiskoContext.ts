import { useSetAtom } from "jotai";
import { useLayoutEffect, useMemo } from "react";

import type { Id } from "~/lib/convex/api";

import { type CookingParams, cookingContextOf } from "../_model/cookingContext";
import { type CuiskoContext, cuiskoContextAtom } from "./atoms";

/**
 * Builds what the open assistant knows beyond the question, from the params it was opened with,
 * and holds it for every question asked until it closes (`cuiskoContextAtom`).
 *
 * Called by the assistant route, the one place that owns its URL; `useAskCuisko` reads the result
 * and never learns where it came from.
 *
 * **A layout effect, not an effect.** The screen sends the question it was opened with from its own
 * mount effect, and a child's effects run before its parent's: published in an effect, the context
 * landed one beat after that first question had gone without it. Layout effects all run before any
 * effect, so it is in place when the screen sends — `useAskCuisko` reads it at send time, not from
 * the render that captured its callback.
 *
 * @limitation Two assistants stacked share one context, and closing the top one empties it for the
 * one underneath. **Accepted because** stacking them takes a round trip — a recipe card in the
 * assistant, cooking it, asking from its stove — and the one underneath then answers without a
 * recipe rather than with a wrong one (`<recipe>none</recipe>`). **Until fixed**, a cook back in the
 * first assistant asks from its recipe's stove again. **The fix** is for each mount to put back
 * what it replaced on unmount, rather than `{}`.
 */
export const useCuiskoContext = ({ recipeId, step, servings }: CookingParams): CuiskoContext => {
  const setContext = useSetAtom(cuiskoContextAtom);

  const context = useMemo((): CuiskoContext => {
    const cooking = cookingContextOf({ recipeId, step, servings });
    return cooking ? { recipe: { ...cooking, id: cooking.id as Id<"recipes"> } } : {};
  }, [recipeId, step, servings]);

  useLayoutEffect(() => {
    setContext(context);
    return () => setContext({});
  }, [context, setContext]);

  return context;
};
