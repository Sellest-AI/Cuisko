import { useAtomValue } from "jotai";
import { useMemo, useState } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useQueryCached } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

import { runConstraintsOf } from "../_model/constraints";
import { draftMealOf, startOfDay, type DraftMeal } from "../_model/model";
import {
  constraintsAtom,
  cookingTimeAtom,
  equipmentsAtom,
  peopleAtom,
  planDatesAtom,
  seeksAtom,
  slotsAtom,
} from "./atoms";

/**
 * A week generated from the real library and the household's cellar, for the tunnel's answers.
 *
 * `seed` is the caller's, rolled once per run: `getDraft` is a reactive query, and a seed taken
 * anywhere that re-runs would reshuffle the week under a user already reviewing it. `today` is
 * pinned on mount for the same reason — a run straddling midnight keeps the days it was offered.
 * Pinned arguments keep the query's inputs still, not its output: a recipe written into the pool's
 * window re-runs it server-side regardless. `startedAt` is pinned so that re-run comes back the
 * same — the server examines anything written after it last.
 *
 * The days come from `planDatesAtom`, which the tunnel seeds once per run from the household's
 * latest kept plate: the week continues the one already there rather than stacking a second lunch
 * on days that have one. Read, never counted here, so the review draws exactly the days this asked for.
 *
 * The run's diet and allergens go up as arguments, everything still ticked whoever it came from
 * (`runConstraintsOf`), rather than letting the server read the stored preferences the generating
 * step is writing at the same moment. The cooking time goes up the same way and for a stronger
 * reason: no table holds it, and none should — see `@shared/cookingTimes`. The kitchen goes up too,
 * for the first reason: `saveDefaults` writes `households.equipments` at that same moment. The
 * focus step's `seeks` goes up beside them rather than folded into the constraints, because it is
 * the caller's alone and never the household's — see `AggregatedConstraints`.
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
  const equipments = useAtomValue(equipmentsAtom);
  const seeks = useAtomValue(seeksAtom);
  const [today] = useState(() => startOfDay(new Date()));
  const [startedAt] = useState(() => Date.now());

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
      startedAt,
      cookingTime,
      equipments,
      // `null` is a seed that has not landed; the guard above already waits on `constraints`, which lands with it.
      seeks: seeks ?? [],
      ...runConstraintsOf(constraints),
    };
  }, [householdId, constraints, cookingTime, equipments, seeks, locale, seed, people, today, startedAt, dates, slots]);

  const { data, isPending, isError } = useQueryCached(api.router.planning.getDraft.authed, args);

  const meals = useMemo((): DraftMeal[] => (data ?? []).map(draftMealOf), [data]);

  return {
    meals,
    /** A failed generation is not still generating: the step moves on with an empty week rather than waiting forever. */
    isGenerating: args === "skip" || (isPending && !isError),
  };
};
