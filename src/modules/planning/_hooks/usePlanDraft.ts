import { useAtomValue } from "jotai";
import { useMemo, useState } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useQueryCached } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

import { runConstraintsOf } from "../_model/constraints";
import { draftMealOf, startOfDay, type DraftMeal } from "../_model/model";
import { constraintsAtom, cookingTimeAtom, peopleAtom, planDatesAtom, slotsAtom } from "./atoms";

/**
 * A week generated from the real library and the household's cellar, for the tunnel's answers.
 *
 * `seed` is the caller's, rolled once per run: `getDraft` is a reactive query, and a seed taken
 * anywhere that re-runs would reshuffle the week under a user already reviewing it. `today` is
 * pinned on mount for the same reason — a run straddling midnight keeps the days it was offered.
 *
 * The days come from `planDatesAtom`, which the tunnel seeds once per run from the household's
 * latest kept plate: the week continues the one already there rather than stacking a second lunch
 * on days that have one. Read, never counted here, so the review draws exactly the days this asked for.
 *
 * The run's diet and allergens go up as arguments, everything still ticked whoever it came from
 * (`runConstraintsOf`), rather than letting the server read the stored preferences the generating
 * step is writing at the same moment. The cooking time goes up the same way and for a stronger
 * reason: no table holds it, and none should — see `@shared/cookingTimes`.
 *
 * Each meal lands as the server sent it, made the draft's own by `draftMealOf` — see `DraftMeal`.
 */
export const usePlanDraft = ({ seed }: { seed: number }) => {
  const locale = useLocale();
  const { householdId } = useHousehold();
  const dates = useAtomValue(planDatesAtom);
  const slots = useAtomValue(slotsAtom);
  const people = useAtomValue(peopleAtom);
  const constraints = useAtomValue(constraintsAtom);
  const cookingTime = useAtomValue(cookingTimeAtom);
  const [today] = useState(() => startOfDay(new Date()));

  /**
   * Skipped until the constraint list is seeded and the week knows where to start: a draft for
   * "nobody avoids anything", or one stacked on days already planned, is not one to show.
   */
  const args = useMemo(() => {
    if (!householdId || constraints === null || dates.length === 0) return "skip" as const;

    return {
      householdId,
      locale,
      seed,
      servings: people,
      dates: dates.map((date) => date.getTime()),
      slots,
      today: today.getTime(),
      cookingTime,
      ...runConstraintsOf(constraints),
    };
  }, [householdId, constraints, cookingTime, locale, seed, people, today, dates, slots]);

  const { data, isPending, isError } = useQueryCached(api.router.planning.getDraft.authed, args);

  const meals = useMemo((): DraftMeal[] => (data ?? []).map(draftMealOf), [data]);

  return {
    meals,
    /** A failed generation is not still generating: the step moves on with an empty week rather than waiting forever. */
    isGenerating: args === "skip" || (isPending && !isError),
  };
};
