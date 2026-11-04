import { useStore } from "jotai";
import { useCallback } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useAction } from "~/lib/convex/client";

import { VIDEO_IMPORT_MINUTES } from "../_model/importCountdown";
import { importKeyOf } from "../_model/importPath";

import { startImport } from "./startImport";
import { useSetRecipeFavorite } from "./useSetRecipeFavorite";

/** A reel's announced time, which a lost import also waits out before its card goes. */
const VIDEO_IMPORT_MS = VIDEO_IMPORT_MINUTES * 60_000;

/**
 * Starts importing a reel, or joins the import already running for it (`startImport`). The one way
 * into `importVideo`, whichever door the link came through: the share sheet or the pasted link.
 *
 * The import stands on its own once started: it is recorded in `importsInFlightAtom`, which the
 * grid draws as a card, so a caller may leave without waiting on the promise.
 */
export const useImportVideo = () => {
  const locale = useLocale();
  const store = useStore();
  const { action } = useAction(api.router.recipes.importVideo.authed);
  const favorite = useSetRecipeFavorite().set;

  return useCallback(
    (url: string) =>
      startImport(store, {
        url,
        key: importKeyOf(url),
        expectedMs: VIDEO_IMPORT_MS,
        lostMs: VIDEO_IMPORT_MS,
        run: () => action({ url, locale }),
        // `set` holds its own failure: an unfavorited recipe still opens, and the heart says so.
        favorite: (recipeId) => favorite(recipeId, true),
      }),
    [action, favorite, locale, store],
  );
};
