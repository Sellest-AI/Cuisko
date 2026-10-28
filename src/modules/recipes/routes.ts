import type { Href } from "expo-router";

import { isServings } from "@shared/servings";
import { httpUrlOf } from "@shared/urls";

import { WEBSITE } from "~/global/website";

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

/** A recipe's public path, `/r/<id>`, with the slash optional and nothing after the id but a trailing slash. */
const _RECIPE_PATH = /^\/?r\/([^/?#]+)\/?$/;

/** A scheme with its authority (`cuisko://`), what a link arriving through the app's own scheme starts with. */
const _SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * The public address of a recipe: what the share sheet sends, and what opens the app on it.
 *
 * On the website rather than the app's scheme, because a chat app turns an https address into
 * something to tap and leaves `cuisko://` as text. cuisko.app claims `/r/*` for the app (its
 * `.well-known` files), and serves a page with the store badges to a phone without it.
 * `recipeIdOfLink` below is the reader of the same format.
 *
 * The id is the Convex id itself: any signed-in cook can read any recipe (ADR 0014), so it grants
 * nothing the link does not, and a slug or short code would need a table of its own.
 */
export const recipeLink = (id: string): string => `${WEBSITE.URL}/r/${encodeURIComponent(id)}`;

/**
 * The recipe id a link names, or nothing when it names none.
 *
 * Reads every form the link reaches the app in: the https address (a tap that opened the app, or
 * the link shared into Cuisko, words around it included), the bare path Expo Router may hand
 * `redirectSystemPath`, and the app's scheme (`cuisko://r/<id>`). A web address is read through
 * `httpUrlOf`, as the import reads it, so one link never parses two ways, and only on the
 * website's own host, `www` included since the site redirects it to the apex. The id is not
 * checked as a Convex id: a wrong one opens the recipe page's missing state, which already says
 * the link may be wrong.
 */
export const recipeIdOfLink = (link: string): string | undefined => {
  const web = /^https?:\/\//i.test(link.trim()) || /\s/.test(link.trim()) ? httpUrlOf(link) : undefined;
  if (web) {
    const url = new URL(web);
    if (url.hostname.replace(/^www\./, "") !== new URL(WEBSITE.URL).hostname) return undefined;

    return _idOfPath(url.pathname);
  }

  return _idOfPath(link.trim().replace(_SCHEME, "").replace(/[?#].*$/, ""));
};

/** A link is text anyone can type: an escape that does not decode names no recipe, rather than throwing on the way in. */
const _idOfPath = (path: string): string | undefined => {
  const encoded = _RECIPE_PATH.exec(path)?.[1];
  if (!encoded) return undefined;

  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
};
