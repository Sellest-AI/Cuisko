import { useMemo } from "react";

import { useRecipeMatches } from "~/modules/recipes/hooks";

import { coversTitle, useSuggestions } from "./useSuggestions";

/** What the bar is offering: a food to put on a list, or a dish to go and look at. */
export type SuggestionKind = "ingredient" | "recipe";

/**
 * Which of the two lists the navigation bar shows, and never both.
 *
 * **The ruling is about coverage, not about relevance.** Both sides match "boeuf" strongly — the
 * catalog because it holds beef, the recipe search because it also scans what a recipe contains —
 * so comparing how *well* each side scored is a coin flip on exactly the input that must stay an
 * ingredient. What separates the two cases is whether the catalog can account for the whole input:
 * "beurre" is fully explained by `beurre doux`, and "boeuf bourguignon" leaves a word that no
 * label explains.
 *
 * Two gates, and the order is the contract:
 *
 * 1. the catalog covers every word typed → **ingredient**, and the recipes are not consulted
 * 2. otherwise, any recipe whose *title* the input covers → **recipe**
 * 3. otherwise → still ingredient, which is how an unknown food reaches the resolver unchanged
 *
 * **Gate 3 stays reachable because the catalog is global.** A recipe titled "Tarte au yuzu" was
 * imported with a yuzu ingredient, and `resolveIngredient` put that row in the same catalog every
 * cook searches — so gate 1 claims the word before gate 2 can, and a food is only ever "unknown"
 * here when no recipe holds it either. Scope either side to one cook and that stops being true:
 * gate 2 would start answering for foods gate 3 exists to learn, and nothing here would fail.
 *
 * **Gate 2 filters on the title, and dropping that filter would break gate 3.** The search also
 * scans the ingredient blob, and Convex full-text matching is per-term rather than all-terms, so
 * "huile olive vierge extra" comes back carrying every recipe that contains oil. Firing on those
 * would claim almost every input the catalog could not explain — and gate 3, the path that lets a
 * genuinely new food be learned, would stop being reachable at all.
 *
 * Gate 3 is also why this returns `kind` beside the ingredient bag rather than a union of the two:
 * the bar still submits through the ingredient path while showing recipes, so `rest`, `amount`,
 * `unit` and `matchingSuggestion` have to stay reachable whichever list is on screen.
 *
 * **`enabled: false` turns the whole thing off, queries included.** On the assistant screen the bar
 * is a chat box: a shopper typing "tomates" there is writing a sentence, not reaching for the
 * catalog, and a panel offering to put tomatoes on their list is an interruption with nothing
 * behind it.
 *
 * It is a parameter rather than something the caller works around by passing `""`, and the
 * difference is not style. Empty text happens to skip every query today, so the panel would be
 * empty — but "empty" is exactly the input a bar would one day answer with recently-used foods, and
 * on that day the suggestions would come back on the assistant screen with nothing in the diff to
 * explain why. Stated here, the intent survives that change.
 */
export const useBarSuggestions = (text: string, enabled = true) => {
  const ingredient = useSuggestions(enabled ? text : "");

  /**
   * Asked even while gate 1 is going to win, because a hook cannot be called conditionally — and
   * it costs nothing that matters: the query is debounced and skipped below its own minimum, and
   * the shopper is typing into a box either way.
   *
   * **`rest`, not `text`: a quantity is shopping grammar, and no dish is named after one.** The
   * catalog is already asked without it, and the title index has to be too — "2 kg boeuf
   * bourguignon" would otherwise spend part of one page's budget on rows matching "2" and "kg",
   * and crowd out the dish the cook actually named. `rest` rather than `query` because the index
   * holds titles as they are written: `query` normalises "pommes de terre" into "pomme terre",
   * which is right for finding a catalog row by typo and wrong for finding a name.
   */
  const matches = useRecipeMatches(enabled ? ingredient.rest : "");
  const { recipes: candidates, term } = matches;

  /**
   * Narrowed against `term` and not against `text`: the cards came back for the settled term, and
   * judging them by the live one asks whether titles cover a word the server never saw. Mid-word
   * that is always false, so the panel would drop its recipes and flip back to ingredients on
   * every keystroke until the debounce caught up.
   */
  const recipes = useMemo(
    () => candidates.filter((recipe) => coversTitle(term, recipe.title)),
    [candidates, term],
  );

  const kind: SuggestionKind =
    !ingredient.isFullyCovered && recipes.length > 0 ? "recipe" : "ingredient";

  return {
    kind,
    ingredient,
    recipes: enabled ? recipes : [],
    /**
     * Whether there is anything at all to draw — the bar opens its panel on this.
     *
     * `enabled` is asserted here rather than left to the starved queries above. Feeding the two
     * hooks an empty string stops them ASKING, which is the saving; it does not promise they
     * answer with nothing, and a hook that one day responds to an empty bar with recently-used
     * foods would put the panel straight back on the assistant screen. Off means off, stated once.
     */
    hasSuggestions:
      enabled && (kind === "recipe" ? recipes.length > 0 : ingredient.hasSuggestions),
  };
};
