import { router } from "expo-router";
import { useCallback } from "react";

import { httpUrlOf } from "@shared/urls";

import type { Id } from "~/lib/convex/api";

import { importPathOf } from "../_model/importPath";
import { recipeIdOfLink, recipeRoute } from "../routes";

import { useImportRecipe } from "./useImportRecipe";
import { useImportVideo } from "./useImportVideo";
import { useSetRecipeFavorite } from "./useSetRecipeFavorite";

/**
 * A link pasted into the import screen, sent to the recipe it names or down the road `importPathOf`
 * picks.
 *
 * - **a Cuisko recipe** (`cuisko.app/r/<id>`): there is nothing to import, and scraping the website
 *   would find no recipe. It opens, and goes on the cook's shelf: `favorite` holds its own failure,
 *   so a stale link opens the recipe page's missing state and nothing is shelved.
 * - **web**: `useImportRecipe`, whose wait and failure this hook hands to the screen as they are.
 * - **video**: the import starts and the cook lands on their recipes at once, where its card counts
 *   down. A reel takes minutes and there is nothing to correct at the end of it, so the sheet has no
 *   reason to stay open. The promise is left alone: `startImport` already handles its rejection.
 *
 * One import at a time, as `useImportRecipe` guards its own: a reel started during a scrape would
 * land the cook on their recipes, and the scrape's draft would then pull them into the editor. The
 * field stays editable while it runs, and only its button shows the wait.
 *
 * `dismissTo` because the sheet may be open over the recipes already: `replace` would stack a
 * second list on the first, and Back would land on the same page.
 *
 * The address goes out as `httpUrlOf` reads it, because the card opens it: `instagram.com/reel/x`
 * is a reel to `importPathOf`, and nothing `Linking.openURL` can open.
 *
 * @limitation A pasted reel that fails (a private post, a video with no dish) has no sheet left to
 * say why: its card goes, and nothing replaces it. The screen cannot refuse it first, since only
 * the server's adapters know what they can read.
 */
export const useImportPastedLink = () => {
  const { importFrom: importWeb, isImporting, error } = useImportRecipe();
  const importVideo = useImportVideo();
  const favorite = useSetRecipeFavorite().set;

  const importFrom = useCallback(
    async (text: string) => {
      if (isImporting) return;

      const url = httpUrlOf(text);
      const recipeId = url && recipeIdOfLink(url);
      if (recipeId) {
        void favorite(recipeId as Id<"recipes">, true);
        router.replace(recipeRoute(recipeId));
        return;
      }

      if (!url || importPathOf(url) === "web") return importWeb(text);

      void importVideo(url);
      router.dismissTo("/recipes");
    },
    [favorite, importVideo, importWeb, isImporting],
  );

  return { importFrom, isImporting, error };
};
