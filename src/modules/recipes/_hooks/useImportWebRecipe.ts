import type { ImportFailure } from "../_model/importFailure";

export type WebRecipeImport = {
  /** A no-op while this url is already importing. */
  start(): void;
  status: "idle" | "importing" | "done" | "failed";
  /** Done only: the recipe the page became, or the one it already was. */
  recipeId?: string;
  /** Importing only: how full the bar is, 0 to 0.95, re-read each second. */
  progress?: number;
  /** Failed only: `importFailureOf(error, "web")`. */
  failure?: ImportFailure;
};

/**
 * Adds one web recipe page the chat found to the cook's recipes, and says how far it got.
 *
 * @limitation Not wired yet: it answers idle and `start` does nothing, so the card can be drawn
 * before `importWeb` exists. The import, the shared in-flight atom and the bar's clock replace this
 * body in the next slices (docs/plans/web-recipe-search.md, slice 5).
 */
export const useImportWebRecipe = (_url: string): WebRecipeImport => ({
  start: () => undefined,
  status: "idle",
});
