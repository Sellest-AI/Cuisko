/** The answers C19 reads — kept apart so its tests can build a tree that satisfies them. */

const TRIGGERED_ON_THE_DASHBOARD = "triggered by hand on the Convex dashboard, so no code calls it";

const NOTHING_NEEDS_IT_YET =
  "nothing calls it, in this repo or the showcase website; kept on a deliberate decision rather than a need";

/**
 * The router exports that are allowed to have no caller, each with the reason. C19 prints this list
 * on every passing run, so that whoever reads it can ask whether an entry still earns its place: an
 * entry here is a function nobody has shown to be alive.
 */
export const NO_CALLER = {
  "router/ingredients/mergeIngredient:_internal": TRIGGERED_ON_THE_DASHBOARD,
  "router/ingredients/replaceInRecipes:_internal": TRIGGERED_ON_THE_DASHBOARD,
  "router/recipes/deleteOne:_internal": TRIGGERED_ON_THE_DASHBOARD,
  "router/recipes/getOne:server": "called by the showcase website's server, for a shared link's preview",
  "router/media/images/getMany:anon": NOTHING_NEEDS_IT_YET,
  "router/media/images/getOne:anon": NOTHING_NEEDS_IT_YET,
  "router/media/images/saveMany:server": NOTHING_NEEDS_IT_YET,
  "router/media/images/saveSizes:server": NOTHING_NEEDS_IT_YET,
  "router/media/images/uploadMany:authed": NOTHING_NEEDS_IT_YET,
};
