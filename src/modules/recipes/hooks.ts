/**
 * The recipe hooks other modules may call.
 *
 * The planning sheet that puts a recipe on a plate draws the dish it is about to plan — its title
 * and its picture — through `useRecipe`; the meal sheet that swaps one draws the cook's library and
 * the catalog's matches through `useRecipeList`, the same grid the recipes page draws. One hook for
 * both screens, so the two cannot rank a search differently.
 */
export { useRecipe } from "./_hooks/useRecipe";
export { useRecipeList } from "./_hooks/useRecipeList";
