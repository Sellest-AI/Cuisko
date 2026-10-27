/**
 * The route `OfflineGate` turned away, kept whole so the offline page can open it once the signal
 * returns: the route's template (`/recipe/[id]`) and every param, dynamic and query alike
 * (`{ id: "123", servings: "4" }`). The pathname alone would drop the query.
 */
export type BlockedRoute = { pathname: string; params: Record<string, string | string[]> };

/** As the one string param the offline route carries: route params are text. */
export const toFromParam = (route: BlockedRoute) => JSON.stringify(route);

/** `undefined` for a param that is missing or does not read as a route: the page then goes home. */
export const parseFromParam = (from: string | string[] | undefined): BlockedRoute | undefined => {
  if (typeof from !== "string") return undefined;
  try {
    const route: unknown = JSON.parse(from);
    if (
      typeof route === "object" && route !== null &&
      "pathname" in route && typeof route.pathname === "string" &&
      "params" in route && typeof route.params === "object" && route.params !== null
    )
      return { pathname: route.pathname, params: route.params as BlockedRoute["params"] };
  } catch (error) {
    console.warn("[offline] `from` does not parse; going home instead", error);
  }
  return undefined;
};
