import { archiveRecipe } from "@convex/functions/recipes/archiveRecipe";
import { ownedMutation } from "@convex/procedures";

/**
 * Deletes one of the caller's recipes, as a cook sees it: it leaves their list, search and planning,
 * and stays readable from the meals already cooked with it.
 *
 * `ownedMutation`, so only the recipe's author reaches the handler. A catalog recipe has no author
 * and is refused with the rest; the catalog's own removal is `deleteOne._internal`, run by hand.
 */
export const authed = ownedMutation("recipes")({
  args: {},
  handler: (ctx) => archiveRecipe(ctx, { recipe: ctx.doc }),
});
