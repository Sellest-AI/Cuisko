import { atom } from "jotai";

/**
 * What the open modal wants the sheet to be, in the terms the screen can actually speak.
 *
 * `measured` is a content height in pixels, reported by the screen's own layout pass. `declared` is
 * a fraction of the window, for a screen whose natural height is not a number anybody wants — a
 * catalogue of every recipe would ask for a sheet taller than the phone.
 *
 * `isFullBleed`: the screen starts at the sheet's top edge, under the close button, with no
 * grabber, top border or fade — for a screen that opens on a picture.
 */
export type SheetSize =
  | { kind: "measured"; height: number; isFullBleed: boolean }
  | { kind: "declared"; ratio: number };

/**
 * One open modal, one size — so one atom, and it stays inside this folder.
 *
 * `index.ts` re-exports the hooks and not this, which is the whole reason the file is a
 * folder: the hooks share a piece of state that nothing outside may write, and a flat file cannot
 * express "shared between these hooks, private to them" without exporting it to the module.
 */
export const sheetSizeAtom = atom<SheetSize | null>(null);
