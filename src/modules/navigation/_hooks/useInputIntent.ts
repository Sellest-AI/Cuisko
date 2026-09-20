import { useCallback } from "react";

import { isGuess, readIntent, type Intent } from "@shared/inputIntent";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useAction } from "~/lib/convex/client";

/** What the bar's panel already worked out, and the only evidence the local rules read. */
type Evidence = {
  /** `rankSuggestions` found a confident catalog match for what was typed. */
  hasCatalogHit: boolean;
  /** The panel's ruling came out as recipes — a title covers the input. */
  hasRecipeHit: boolean;
};

/**
 * What the shopper meant by what they typed — the whole answer, from both of the places it comes.
 *
 * **Local first, and local usually wins.** `readIntent` decides from six rules, and four of them
 * read something the shopper wrote on purpose: a question mark, a leading trigger word, a catalog
 * hit, a recipe title. Those are answered here, for free, in the same tick, and a model is never
 * given the chance to overrule them — a judgment that could outvote "?" would turn "? tomate" back
 * into a tomato.
 *
 * The other two are guesses — a word count, and having run out of rules — and only those are worth
 * a round trip. So the cost of this hook is zero on most submissions and one call on the two cases
 * that are wrong today.
 *
 * **Both halves live here rather than in the bar.** The bar's job is to route what it is handed,
 * and splitting the decision across the two meant the fallback rule — what to do when the model has
 * no opinion — sat in a component, one `if` away from the rules it is the exception to. Evidence
 * travels in rather than being looked up, for the reason `readIntent` takes it as an argument: the
 * rules belong to the caller's view of the panel, and what the cook is looking at is what Enter
 * must agree with.
 *
 * **It never rejects.** Every failure resolves to the local answer, which is where the input goes
 * today: an unconfident judgment (the floor lives on the server), one that could not be reached, or
 * a caller who is not signed in — `classify.authed` refuses that one, and a shopper typing into the
 * bar before signing in must still get their word onto a list.
 */
export const useInputIntent = () => {
  const locale = useLocale();
  const { action: classify, isLoading } = useAction(api.router.assistant.classify.authed);

  const resolve = useCallback(
    async (text: string, evidence: Evidence): Promise<Intent> => {
      const local = readIntent(text, evidence.hasCatalogHit, evidence.hasRecipeHit);
      if (!isGuess(local)) return local;

      const term = text.trim();
      if (!term) return local;

      try {
        const confirmed = await classify({ text: term, locale });

        // No opinion means keep the one we had: for the fall-through that is the resolver, and for
        // the word count the assistant. Both are exactly where the input goes today.
        return isGuess(confirmed) ? local : confirmed;
      } catch (error) {
        // Not silent, and not a throw either: the local answer is a complete answer, so this is a
        // line in the log rather than anything the shopper should be told about.
        console.warn("The bar could not confirm what was typed", error);

        return local;
      }
    },
    [classify, locale],
  );

  /** `isChecking` rather than `isLoading`: nothing is loading, and the bar spins its mic on it. */
  return { resolve, isChecking: isLoading };
};
