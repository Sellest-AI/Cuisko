import type { WeekSummary } from "@shared/weekSummary";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useQueryDevice } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

/**
 * The household's week summary: what the card at the top of Home draws. Every figure arrives
 * computed by `getWeekSummary` (ADR 0015); this hook only binds the query to the household in view.
 */
export const useWeekSummary = (): { summary: WeekSummary | undefined } => {
  const locale = useLocale();
  const { householdId } = useHousehold();

  const { data } = useQueryDevice(
    api.router.health.getWeekSummary.authed,
    householdId ? { householdId, locale } : "skip",
  );

  return { summary: data };
};
