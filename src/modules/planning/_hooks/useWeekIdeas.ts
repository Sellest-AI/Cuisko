import { useState } from "react";

import type { Cuisine } from "@shared/cuisines";
import { weekKeyOf } from "@shared/dates";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useQueryCached } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

/** A card as the shelf draws it — the router's `RecipeCard`, restated structurally (ADR 0002). */
export type WeekIdea = {
  id: string;
  title: string;
  cuisine: Cuisine;
  coverImageUrl?: string;
};

/**
 * The home shelf's picks for this week.
 *
 * The key is the device's local Monday, computed once per mount: a screen left open across
 * midnight on Sunday keeps its shelf until it is next opened, which is the quiet rotation the
 * shelf promises — nobody presses anything, and nothing is stored.
 */
export const useWeekIdeas = (): { ideas: WeekIdea[]; isLoading: boolean } => {
  const locale = useLocale();
  const { householdId, isLoading: isResolvingHousehold } = useHousehold();
  const [weekKey] = useState(() => weekKeyOf(new Date()));

  /** `'skip'` is Convex's idiom for "not yet" — the hook call stays unconditional, the query unsent. */
  const { data, isPending } = useQueryCached(
    api.router.planning.getWeekIdeas.authed,
    householdId ? { householdId, locale, weekKey } : "skip",
  );

  return {
    ideas: data ?? [],
    /** A signed-in user whose household has not resolved is loading, not householdless. */
    isLoading: isResolvingHousehold || (!!householdId && isPending),
  };
};
