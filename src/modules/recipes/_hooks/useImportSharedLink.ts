import { router } from "expo-router";
import { useStore } from "jotai";
import { useEffect, useRef, useState } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useAction } from "~/lib/convex/client";

import { importFailureOf, type ImportFailure } from "../_model/importFailure";
import { importKeyOf, importPathOf, type ImportPath } from "../_model/importPath";
import { recipeRoute } from "../routes";

import { importsInFlightAtom } from "./atoms";
import { useImportRecipe } from "./useImportRecipe";
import { useSetRecipeFavorite } from "./useSetRecipeFavorite";

type Status = "importing" | "failed";

/**
 * A link someone shared to Cuisko, imported the moment the share sheet opens.
 *
 * Two roads, picked by `importPathOf`:
 * - **video**: `importVideo` watches the reel and creates the recipe (up to 3 minutes). If it lands while the
 *   sheet is still open, the sheet is replaced by that recipe. If the cook closed it first, nothing
 *   navigates: the server finishes regardless (an action runs to its end once called), and the
 *   recipe is waiting in their list. Closing never cancels, which is what the sheet's copy promises.
 *   A video another cook already imported answers at once with their recipe (`isOwned: false`), which
 *   is favorited before it opens, so it sits on this cook's shelf like one they imported. Done once,
 *   by the share that started the import, and whether or not the sheet is still open.
 * - **web**: the paste-a-link import, unchanged (`useImportRecipe`), which hands the editor a draft.
 *
 * **One import per reel at a time.** A video import in flight is kept in `importsInFlightAtom`; the
 * same reel shared again before it lands (a second tap, a re-share from Instagram) opens a sheet
 * that waits on that same import instead of starting another. Memory only: after a restart a share
 * starts afresh, and the server's dedupe answers it if the first one finished. The web road is left
 * out: it creates nothing and costs no model, so a repeated scrape is harmless.
 *
 * Started once per mount, guarded by a ref: a strict-mode double effect runs the effect twice.
 *
 * There is no `done`: success leaves the sheet, so the state it would describe never renders.
 */
export const useImportSharedLink = (url: string): { path: ImportPath; status: Status; failure?: ImportFailure } => {
  const locale = useLocale();
  const store = useStore();
  const { action } = useAction(api.router.recipes.importVideo.authed);
  const web = useImportRecipe();
  const favorite = useSetRecipeFavorite().set;

  const path = importPathOf(url);
  const [videoError, setVideoError] = useState<unknown>(null);

  const started = useRef(false);
  const isOpen = useRef(true);

  useEffect(() => {
    isOpen.current = true;
    return () => {
      isOpen.current = false;
    };
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (path === "web") {
      void web.importFrom(url);
      return;
    }

    /**
     * Join the import already running for this reel, or start it. Read and written through the
     * store, synchronously, rather than through a rendered `useAtom` value: two sheets opened in the
     * same moment would both read an empty map from their last render and both start an import.
     */
    const key = importKeyOf(url);
    let pending = store.get(importsInFlightAtom).get(key)?.recipe;

    if (!pending) {
      pending = action({ url, locale }).then(async (imported) => {
        // `set` holds its own failure: an unfavorited recipe still opens, and the heart says so.
        if (!imported.isOwned) await favorite(imported.recipeId, true);
        return imported;
      });
      const entry = { url, startedAt: Date.now(), recipe: pending };
      store.set(importsInFlightAtom, (inFlight) => new Map(inFlight).set(key, entry));

      const settle = () =>
        store.set(importsInFlightAtom, (inFlight) => {
          const next = new Map(inFlight);
          next.delete(key);
          return next;
        });
      pending.then(settle, settle);
    }

    pending.then(
      ({ recipeId }) => {
        if (isOpen.current) router.replace(recipeRoute(recipeId));
      },
      (caught: unknown) => {
        if (isOpen.current) setVideoError(caught);
      },
    );
  }, [action, favorite, locale, path, store, url, web]);

  const error = path === "video" ? videoError : web.error;
  const failure = importFailureOf(error, path);

  return { path, status: failure ? "failed" : "importing", failure };
};
