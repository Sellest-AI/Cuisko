import type { SubstitutionsCard } from "@shared/assistant";
import { useMemo } from "react";

import type { SubstitutionSide } from "@ui/cards/substitutions";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import type { Id } from "~/lib/convex/api";
import { useQuery } from "~/lib/convex/client";

/**
 * The swaps one assistant turn suggested, with each ingredient's name, emoji and picture.
 *
 * **Ids are all that was stored; the rows are resolved now**, the way `useAssistantRecipes` resolves
 * recipe cards, so an ingredient renamed or given a picture since is drawn as it is today. The cast
 * to `Id` is the same one acknowledged there: the ids went through `missingIngredientIds` before
 * they were stored.
 *
 * A swap whose either side no longer resolves is left out: half a row says nothing.
 */
export const useAssistantSubstitutions = (card: SubstitutionsCard) => {
  const locale = useLocale();
  const ids = useMemo(
    () => [...new Set(card.swaps.flatMap(({ from, to }) => [from, to]))] as Id<"ingredients">[],
    [card],
  );

  const found = useQuery(api.router.ingredients.list.anon, ids.length > 0 ? { ids, locale } : "skip");

  const swaps = useMemo(() => {
    const sides = new Map<string, SubstitutionSide>(
      (found.data ?? []).map((row) => [
        row._id,
        { name: row.name, emoji: row.emoji, imageUrl: row.image?.sizes.thumbnail?.url },
      ]),
    );

    return card.swaps.flatMap(({ from, to }, index) => {
      const fromSide = sides.get(from);
      const toSide = sides.get(to);

      return fromSide && toSide ? [{ key: `${index}-${from}-${to}`, from: fromSide, to: toSide }] : [];
    });
  }, [card, found.data]);

  return {
    swaps,
    /** Only the first load, like the recipe cards. */
    isLoading: ids.length > 0 && found.data === undefined,
  };
};
