import { useAtom } from "jotai";
import { useCallback, useMemo } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api, type Id } from "~/lib/convex/api";
import { useQueryCached } from "~/lib/convex/client";

import { scaleNutrition, scaleTo } from "../_model/detail";
import { scaleInstructions } from "../_model/quantities";
import { servingsAtom } from "./atoms";

/** A recipe for nobody is not a recipe; the minus stops here rather than wrapping to zero. */
const MIN_SERVINGS = 1;

/**
 * One recipe, in the language the cook is reading in, scaled to the number of people they asked for.
 *
 * **The door every recipe screen goes through.** The chrome, the three tabs and the cooking
 * session all draw parts of the same recipe, and the tabs mount through a `Slot` — so there is no
 * prop the chrome could hand down. Each of them calls this instead, and Convex deduplicates
 * identical subscriptions, so every caller shares one query and one cache entry.
 *
 * The id is the caller's rather than read off the route here. Every caller does happen to sit
 * under a `[id]` segment today, but taking it as an argument keeps the hook usable by anything
 * holding a recipe id, and keeps knowledge of the route's parameter names in the route layer
 * where it belongs.
 *
 * `useQueryCached` and not `useQueryHeld`: the id does not change under a mounted screen, so there
 * is no previous answer worth holding — and holding one across a change of id would mean showing
 * one recipe under another's title.
 */
export const useRecipe = (id: string | undefined) => {
  const locale = useLocale();
  const [chosen, setChosen] = useAtom(servingsAtom);

  /**
   * An id from a route parameter is a string until the server says otherwise. The cast is what
   * every screen would otherwise write for itself; the query is `ownedQueryI18n`, so a string that
   * names nothing — or names somebody else's recipe — comes back as an error rather than a row.
   */
  const query = useQueryCached(
    api.router.recipes.getOne.authed,
    id ? { id: id as Id<"recipes">, locale } : "skip",
  );

  /**
   * Whether there is anything to ask about, and the single answer both flags below are derived from.
   *
   * `Boolean(id)` rather than `id !== undefined`, because the query skips on *any* falsy id and an
   * empty string is one. Read separately, the two spellings disagree: `""` skipped the query while
   * still counting as an id, so the screen sat on a spinner that nothing would ever resolve and
   * never fell through to the missing state either.
   */
  const hasId = Boolean(id);

  const recipe = query.data;

  /**
   * What the cook asked for, or what the recipe was written with.
   *
   * Resolved at read time rather than pushed into the atom by an effect, and the comparison against
   * the id is what makes that possible — see `servingsAtom`. It is 1 only while there is no recipe
   * yet, and no screen draws a quantity in that state.
   */
  const servings = (chosen?.id === recipe?.id ? chosen?.servings : undefined) ?? recipe?.servings ?? 1;

  /**
   * The floor lives here rather than at the two steppers that call this.
   *
   * Both of them used to clamp for themselves — one against a named `MIN_SERVINGS`, the other
   * against a bare `1` written inline — which is the same rule stated twice and, at the second
   * site, stated without saying why. Clamping at the setter means a third caller cannot get it
   * wrong, and the steppers go back to describing what they draw.
   */
  const setServings = useCallback(
    (next: number) => {
      if (recipe) setChosen({ id: recipe.id, servings: Math.max(MIN_SERVINGS, Math.round(next)) });
    },
    [recipe, setChosen],
  );

  /**
   * The recipe as the screens should draw it: everything the servings stepper moves, already moved.
   *
   * Scaled here rather than by each screen because forgetting to scale is invisible — the page
   * still renders, with quantities for a different number of people and no error anywhere. Handing
   * back a recipe that is already correct means no caller can get it wrong.
   *
   * `nutrition.total` and `nutrition.grams` scale with it; `perServing` and `nutriScore` do not.
   * That split lives in `scaleNutrition`, which says why.
   *
   * The method scales too, and has to: a cook halving a recipe read 250 g of flour on the
   * ingredients tab and "ajoutez 500 g de farine" on the next one. `scaleInstructions` rewrites
   * only the numbers it can tie to a line of this recipe, so an oven temperature and a resting
   * time stay exactly as written — the rule, and why it is safe, are in `_model/quantities.ts`.
   * It matches against the written lines rather than the scaled ones; only the quantities differ
   * between the two, and matching reads names.
   *
   * Both helpers return their input unchanged at a ratio of 1, so at the stepper's resting position
   * this memo produces the same objects the query did rather than copies of them.
   */
  const scaled = useMemo(() => {
    if (!recipe) return undefined;

    return {
      ...recipe,
      ingredients: scaleTo(recipe.ingredients, recipe.servings, servings),
      instructions: scaleInstructions(
        recipe.instructions,
        recipe.ingredients,
        recipe.servings,
        servings,
      ),
      ...(recipe.nutrition && {
        nutrition: scaleNutrition(recipe.nutrition, recipe.servings, servings),
      }),
    };
  }, [recipe, servings]);

  return {
    recipe: scaled,
    /** The scaled lines on their own, for the screens that draw a list and nothing else. */
    ingredients: scaled?.ingredients ?? [],
    servings,
    setServings,
    /**
     * A skipped query is not loading. Without this, a screen mounted before its id arrives sits on
     * a spinner that nothing will ever resolve.
     */
    isLoading: hasId && query.data === undefined && query.error === undefined,
    /**
     * No id to ask about, or the backend refused the one we had — not found, or not the caller's.
     *
     * The two are one state on purpose: they are the same thing to a cook, who arrived at a page
     * for a recipe that is not theirs to read, and telling them which of the two it was would
     * confirm that somebody else's recipe exists.
     */
    isMissing: !hasId || query.error !== undefined,
  };
};
