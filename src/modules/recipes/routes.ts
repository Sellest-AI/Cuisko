import type { Href } from "expo-router";

import { isServings } from "@shared/servings";

/**
 * The way into a recipe page, and the one thing a caller may say about how to open it.
 *
 * A plate on the plan was planned for a number of people, and a cook tapping it wants the recipe
 * for that many — not for the four it was written for and a stepper to correct. The count travels
 * as a query parameter rather than through the servings atom directly, so a link can carry it too
 * and the recipe page has one way of learning it. Left out, the recipe opens at its own servings.
 *
 * Exported from the module root because the callers are other modules' screens — the home
 * carousel and the planning lists — and this is the only place that knows the parameter's name.
 * `servingsParamOf` beside it is the other half: the writer and the reader of one format, kept in
 * one file so they cannot drift apart.
 */
export const recipeRoute = (id: string, servings?: number): Href => ({
  pathname: "/recipe/[id]",
  params: servings === undefined ? { id } : { id, servings: String(servings) },
});

/**
 * The servings a route arrived with, or nothing worth seeding.
 *
 * A query parameter is text anyone can type, so it is held to the same rule the server holds a
 * plate to (`isServings`): a whole number of places at the table. `Number("")` is `0` and
 * `Number("abc")` is `NaN`, and both fail it — the recipe then opens at its own servings, which
 * is what a link with no count does.
 */
export const servingsParamOf = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined;

  const servings = Number(raw);

  return isServings(servings) ? servings : undefined;
};
