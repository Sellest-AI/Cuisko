import type { FunctionReturnType } from "convex/server";
import { atom } from "jotai";

import type { api } from "~/lib/convex/api";

/**
 * A scraped page as the editor's fields.
 *
 * Read off the action's own return type rather than restated, so `vRecipeDraft` changing on the
 * backend is a type error here instead of a field that quietly stops arriving.
 */
export type ImportedDraft = FunctionReturnType<typeof api.router.recipes.importOne.authed>;

/**
 * The scrape, waiting for the editor one route away.
 *
 * `/recipe/new?ingredients=...` would be a URL carrying kilobytes of recipe text: visibly broken on
 * web, and mangled by any encoding slip along the way. So `useImportRecipe` writes it here and
 * `replace`s to `/recipe/new`, which is what module-scoped Jotai state is for.
 *
 * **It is consumed once and cleared.** The editor seeds from it and immediately resets it to
 * `undefined`, and that reset is load-bearing rather than tidiness: without it, tapping "write a
 * recipe" a minute later reopens the editor full of a recipe the cook already saved. The clearing
 * is also what guards the seed against running twice, since an empty atom is nothing to seed from.
 */
export const importedDraftAtom = atom<ImportedDraft | undefined>(undefined);

/**
 * The servings a cook has chosen, and the recipe they chose them for.
 *
 * The recipe is stored beside the number rather than the number alone, and that pairing is what
 * removes an effect from every screen below. A bare count cannot say whether it belongs to the
 * recipe currently open: scale a curry to eight, open a cake, and the cake is drawn for eight. The
 * usual fix is an effect that resets the atom when the id changes — which is a frame of the wrong
 * quantities, then a re-render. Storing which recipe the choice was about makes it a comparison at
 * read time instead: `chosen.id === recipe.id ? chosen.servings : recipe.servings`, correct on the
 * very first frame and correct again the moment a different recipe opens.
 *
 * `undefined` means the cook has said nothing, and the recipe's own servings stand. It is the
 * initial value because the written count arrives with the query — later than this atom's first
 * read — so any number defaulted here would be a ratio applied before its denominator is known.
 *
 * Jotai rather than component state because separate routes read it: the ingredient list, the
 * cooking session and the cards that show a portion have no tree between them to pass a prop down.
 *
 * **The trade, deliberately:** a choice does not survive leaving the recipe and coming back, and
 * never reaches a second device. Someone who scaled a curry to eight has said nothing about the
 * cake they open next, and has said nothing durable about the curry either.
 */
export const servingsAtom = atom<{ id: string; servings: number } | undefined>(undefined);

/**
 * The recipe a video import ends in, and whether it is the cook's own: a video another cook already
 * imported answers with their recipe. Read off the action like `ImportedDraft`.
 */
export type ImportedVideoRecipe = FunctionReturnType<typeof api.router.recipes.importVideo.authed>;

/** A video import this app started: the link shared, when, and the recipe it will end in. */
export type ImportInFlight = { url: string; startedAt: number; recipe: Promise<ImportedVideoRecipe> };

/**
 * The video imports this app has started and not yet heard back from, by `importKeyOf` key.
 *
 * What makes a second share of the same reel, while the first is still importing, join that import
 * instead of paying for another one: `useImportSharedLink` finds the key here and waits on the same
 * promise, so both sheets end on the same recipe (or the same error). Each entry is removed the
 * moment its import settles. The link and start time are for the grid, which draws each entry as a
 * card counting down until its recipe arrives (`useImportsInFlight`).
 *
 * Memory only, on purpose: a cook who closes the app and shares again gets a fresh attempt, which
 * the server answers with the finished recipe if the first one completed (`findBySource`).
 *
 * A `Map` of promises is the value, not a promise itself, so Jotai stores it rather than suspending
 * on it. Always replaced, never mutated, so a read of the atom is a snapshot.
 */
export const importsInFlightAtom = atom<ReadonlyMap<string, ImportInFlight>>(new Map());

/** What a verify said: the fixes it made, or that there were none. Read off the action like `ImportedDraft`. */
export type VerifyOutcome = FunctionReturnType<typeof api.router.recipes.verifyOne.admin>;

/** One recipe's last verify: running since `startedAt`, or what it said, or how it failed. */
export type Verification =
  | { status: "verifying"; startedAt: number }
  | { status: "done"; outcome: VerifyOutcome }
  | { status: "failed"; error: unknown };

/**
 * The last verify of each recipe, keyed by its id.
 *
 * A check takes most of a minute, and an admin does not wait on the overview for it. Kept in Jotai
 * rather than in the hook, the action's answer lands here even after the screen unmounted, and
 * coming back to the recipe shows the bar still running from `startedAt`, or what it found. Keyed
 * by id, so verifying again replaces only that recipe's entry, and another recipe shows its own.
 *
 * **In memory only, deliberately:** a restart forgets every result. It is a check to read where the
 * button is, not a record. The corrections are already written into the recipe itself.
 */
export const verificationsAtom = atom<Record<string, Verification>>({});
