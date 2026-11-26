import type { Href } from "expo-router";

import type { Cuisine } from "@shared/cuisines";

/**
 * The Explore page, on a cuisine's tile or on the day's featured recipes.
 *
 * The cuisine travels in the URL, and nowhere else: a back gesture, a reload or a shared link then
 * restore the same selection, and the page has one place to read it from (`categoryParamOf`).
 * At the module root because home opens it, and this is the only place that knows the parameter's
 * name.
 */
export const exploreRoute = (cuisine?: Cuisine): Href => ({
  pathname: "/explore",
  params: cuisine ? { category: cuisine } : {},
});

/** Whether a path is the Explore page, whatever its category: the auth gate and the navigation bar ask. */
export const isExplorePath = (pathname: string): boolean => /^\/explore\/?$/.test(pathname);

/** The `?category=` param, read back into a cuisine the page offers: `app/explore.tsx` asks. */
export { categoryParamOf } from "./_model/exploreCategories";
