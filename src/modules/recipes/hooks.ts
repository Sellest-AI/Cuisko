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
/**
 * The navigation bar asks whether a dish by the typed name exists, and narrows what comes back to
 * the titles the input covers. It takes the matches alone rather than `useRecipeList`, which would
 * also subscribe it to the cook's whole paginated library for an answer it never draws.
 */
export { useRecipeMatches } from "./_hooks/useRecipeMatches";
/**
 * The chat draws a web recipe Cuisko found and adds it from its card, through the same in-flight
 * imports a shared reel uses, so the recipes screen shows it arriving too.
 */
export { useImportWebRecipe } from "./_hooks/useImportWebRecipe";
