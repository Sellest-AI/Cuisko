import { seedIngredients } from "@convex/functions/ingredients/seedIngredients";
import { internalMutation } from "@convex/procedures";

/**
 * Writes the starter ingredient catalog. Idempotent — re-running after editing
 * `functions/ingredients/ingredientCatalog.ts` updates rows in place, matched on `slug`.
 *
 * The same seed, reachable from the CLI. `npx convex run` authenticates with the deploy key and
 * carries no user identity, so it can never satisfy `adminMutation` — without this export the
 * catalog could only be seeded by signing in as an admin from the app.
 */
export const _internal = internalMutation({
  args: {},
  handler: (ctx) => seedIngredients(ctx),
});
