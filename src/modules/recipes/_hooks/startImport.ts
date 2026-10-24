import type { useStore } from "jotai";

import { isConnectionLost } from "../_model/importFailure";

import { type ImportedRecipe, type ImportInFlight, importsInFlightAtom } from "./atoms";

type Store = ReturnType<typeof useStore>;

type Options = {
  /** The link as the cook gave it: what the grid's card opens while the recipe is on its way. */
  url: string;
  /** `importKeyOf(url)`: the spelling that tells the same link again from another one. */
  key: string;
  /** How long the import is announced to take: the grid's countdown, the chat card's bar. */
  expectedMs: number;
  /** How long a `lost` entry stays, counted from the start, before it is dropped. */
  lostMs: number;
  /** The server call that creates the recipe, or answers with the one that exists. */
  run: () => Promise<ImportedRecipe>;
  /** Puts another cook's recipe on this cook's shelf (`useSetRecipeFavorite().set`). */
  favorite: (recipeId: ImportedRecipe["recipeId"]) => Promise<unknown>;
};

/**
 * Joins the import already running for `key`, or starts it: the one way a shared reel and a web
 * page added from the chat are imported, so one link is never paid for twice at once.
 *
 * **Read and written through the store, synchronously,** rather than through a rendered `useAtom`
 * value: two callers in the same moment would both read an empty map from their last render and
 * both start an import.
 *
 * A started import is recorded in `importsInFlightAtom` and removed when it settles, but only its
 * own entry: a later start of the same link, after this one was lost, has replaced it under the
 * same key. Lost (the connection dropped, `isConnectionLost`) it stays as `lost` until `lostMs`
 * after its start, because the server is likely still importing; a lost import never answers this
 * app, so a new start replaces it rather than joining it.
 *
 * Another cook's recipe (`isOwned: false`) is favorited inside the pending promise, before anyone
 * waiting on it hears the answer, so a recipe that opens is already on this cook's shelf. Once, by
 * the start that ran the import, however many callers joined it. `favorite` holds its own failure.
 */
export const startImport = (
  store: Store,
  { url, key, expectedMs, lostMs, run, favorite }: Options,
): Promise<ImportedRecipe> => {
  const running = store.get(importsInFlightAtom).get(key);
  if (running?.status === "importing") return running.recipe;

  const recipe = run().then(async (imported) => {
    if (!imported.isOwned) await favorite(imported.recipeId);
    return imported;
  });
  const entry: ImportInFlight = { url, startedAt: Date.now(), expectedMs, status: "importing", recipe };
  store.set(importsInFlightAtom, (inFlight) => new Map(inFlight).set(key, entry));

  const settle = () =>
    store.set(importsInFlightAtom, (inFlight) => {
      if (inFlight.get(key)?.recipe !== entry.recipe) return inFlight;
      const next = new Map(inFlight);
      next.delete(key);
      return next;
    });
  const lose = () => {
    store.set(importsInFlightAtom, (inFlight) => new Map(inFlight).set(key, { ...entry, status: "lost" }));
    setTimeout(settle, entry.startedAt + lostMs - Date.now());
  };
  recipe.then(settle, (caught: unknown) => (isConnectionLost(caught) ? lose() : settle()));

  return recipe;
};
