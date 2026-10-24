import { useAtomValue, useStore } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";

import { useNow } from "@ui/hooks/useNow";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useAction } from "~/lib/convex/client";

import { importProgressOf } from "../_model/importCountdown";
import { importFailureOf, isConnectionLost, type ImportFailure } from "../_model/importFailure";
import { importKeyOf } from "../_model/importPath";

import { type ImportedRecipe, importsInFlightAtom } from "./atoms";
import { startImport } from "./startImport";
import { useSetRecipeFavorite } from "./useSetRecipeFavorite";

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

/** What a page is announced to take: the scrape, then the sanitizer and ingredient resolution. */
const WEB_IMPORT_MS = 30_000;

/**
 * How long a lost Add holds its bar. Longer than the announcement, because a real import can
 * outlast it (`createOne` resolves ingredients inside the wait), and a tap on Add while the first
 * one still runs would find nothing in `findBySource` and pay for a second.
 */
const WEB_IMPORT_LOST_MS = 2 * 60_000;

type Outcome = { recipeId: ImportedRecipe["recipeId"] } | { error: unknown };

/**
 * Adds one web recipe page the chat found to the cook's recipes, and says how far it got.
 *
 * **The editor's two calls, chained, with no editor between them:** `importOne` scrapes the page
 * into a draft, and `createOne` sanitizes and saves it, as Save would. The card never leaves the
 * chat, so the cook can plan the recipe in their next message. A "found" card is a page nobody had
 * imported when the chat searched (`findWebRecipe` checks `findBySource` first), so it is always the
 * cook's own new recipe.
 *
 * **The state is the in-flight atom's, then this mount's.** `importing` while the page is in
 * `importsInFlightAtom`, a `lost` entry included; then `done` or `failed` once the import this
 * mount started or joined answered; else `idle`. So a chat closed and reopened mid-add shows the
 * bar where it had got to and joins the running import's promise (`startImport`), turning into
 * "In your recipes" when it answers, not back into Add.
 *
 * A lost import never answers: its card holds the bar until the entry goes, then shows Add again.
 * Not a failure, so it is never one here.
 *
 * @limitation Nothing is remembered past the import: a card reopened after its page was added
 * shows Add again, and a second tap saves a second copy. The two calls are also two round trips
 * from the phone: a connection lost after the scrape never sends the save, and Add comes back.
 */
export const useImportWebRecipe = (url: string): WebRecipeImport => {
  const store = useStore();
  const locale = useLocale();
  const { action: importOne } = useAction(api.router.recipes.importOne.authed);
  const { action: createOne } = useAction(api.router.recipes.createOne.authed);
  const favorite = useSetRecipeFavorite().set;

  const key = importKeyOf(url);
  const entry = useAtomValue(importsInFlightAtom).get(key);
  const now = useNow(entry !== undefined);
  const [outcome, setOutcome] = useState<Outcome>();

  const isMounted = useRef(true);
  const awaited = useRef<Promise<ImportedRecipe>>(undefined);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /** Hears one import once, however it was reached: started by this card, or joined on mount. */
  const listen = useCallback((recipe: Promise<ImportedRecipe>) => {
    if (awaited.current === recipe) return;
    awaited.current = recipe;

    recipe.then(
      ({ recipeId }) => {
        if (isMounted.current) setOutcome({ recipeId });
      },
      (error: unknown) => {
        if (isMounted.current) setOutcome(isConnectionLost(error) ? undefined : { error });
      },
    );
  }, []);

  // A card that mounts while its page imports (a chat reopened mid-add) waits on that import too.
  useEffect(() => {
    if (entry?.status === "importing") listen(entry.recipe);
  }, [entry, listen]);

  const start = useCallback(() => {
    if (store.get(importsInFlightAtom).has(key)) return;

    setOutcome(undefined);
    listen(
      startImport(store, {
        url,
        key,
        expectedMs: WEB_IMPORT_MS,
        lostMs: WEB_IMPORT_LOST_MS,
        run: async () => {
          const draft = await importOne({ url });
          // A page with no title or description sends none, as the editor's Save does (`useCreateRecipe`).
          const recipeId = await createOne({
            ...draft,
            title: draft.title.trim() || undefined,
            description: draft.description.trim() || undefined,
            locale,
          });
          return { recipeId, isOwned: true };
        },
        favorite: (recipeId) => favorite(recipeId, true),
      }),
    );
  }, [createOne, favorite, importOne, key, listen, locale, store, url]);

  if (entry) {
    return {
      start,
      status: "importing",
      progress: importProgressOf(entry.startedAt, entry.expectedMs, Math.max(now, entry.startedAt)),
    };
  }
  if (outcome && "recipeId" in outcome) return { start, status: "done", recipeId: outcome.recipeId };
  if (outcome) return { start, status: "failed", failure: importFailureOf(outcome.error, "web") };
  return { start, status: "idle" };
};
