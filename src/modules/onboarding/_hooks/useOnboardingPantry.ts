import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";

import { GROCERY_HINTS } from "../_model/fixtures";
import {
  add as addTo,
  buy as buyIn,
  cook as cookIn,
  missingFrom,
  type PantryRow,
} from "../_model/pantry";
import { pantryAtom } from "./atoms";

/**
 * How long a sent hint stays a ghost before it lands: long enough to be seen breathing, which is
 * what the real list does while it looks a word up, and short enough not to feel like a wait.
 */
const RESOLVE_MS = 700;

/**
 * The fake stock the onboarding teaches with: a to-buy list, a cellar, and the one line on its way
 * into the list. Local to the device and to this walk through; nothing is sent anywhere.
 */
export const useOnboardingPantry = () => {
  const [pantry, setPantry] = useAtom(pantryAtom);

  /** The hint being looked up, drawn as a ghost card until it lands on the list. */
  const [resolving, setResolving] = useState<PantryRow | null>(null);

  useEffect(() => {
    if (!resolving) return;

    const timer = setTimeout(() => {
      setPantry((current) => addTo(current, resolving));
      setResolving(null);
    }, RESOLVE_MS);

    return () => clearTimeout(timer);
  }, [resolving, setPantry]);

  /** A hint is spent once its ingredient is anywhere in the kitchen, or on its way there. */
  const isSent = (index: number) => {
    const { ingredient } = GROCERY_HINTS[index]!.row;

    return (
      resolving?.ingredient === ingredient ||
      [...pantry.toBuy, ...pantry.cellar].some((row) => row.ingredient === ingredient)
    );
  };

  return {
    toBuy: pantry.toBuy,
    cellar: pantry.cellar,
    resolving,
    sent: GROCERY_HINTS.map((_, index) => index).filter(isSent),
    /** Ignored while another hint is still resolving: the bar sends one line at a time. */
    add: useCallback(
      (hintIndex: number) => setResolving((current) => current ?? GROCERY_HINTS[hintIndex]!.row),
      [],
    ),
    buy: useCallback((ingredient: string) => setPantry((current) => buyIn(current, ingredient)), [setPantry]),
    /**
     * Plans a recipe: what the cellar cannot cover goes on the list, as planning does in the app,
     * and comes back so the screen can say what was added.
     */
    plan: useCallback(
      (lines: PantryRow[]) => {
        const missing = missingFrom(pantry.cellar, lines);

        setPantry((current) => missing.reduce(addTo, current));

        return missing;
      },
      [pantry, setPantry],
    ),
    /** Takes a recipe's lines out of the cellar, and says what left. */
    cook: useCallback(
      (lines: PantryRow[]) => {
        const { pantry: after, deductions } = cookIn(pantry, lines);

        setPantry(after);

        return deductions;
      },
      [pantry, setPantry],
    ),
  };
};
