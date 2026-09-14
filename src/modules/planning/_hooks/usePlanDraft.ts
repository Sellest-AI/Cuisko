import { useAtomValue } from "jotai";
import { useMemo, useState } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useQueryCached } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

import { runConstraintsOf } from "../_model/constraints";
import { planDates, plateIdFor, startOfDay, type DraftMeal } from "../_model/model";
import { constraintsAtom, daysAtom, peopleAtom, slotsAtom } from "./atoms";

/**
 * A week generated from the real library and the household's cellar, for the tunnel's answers.
 *
 * `seed` is the caller's, rolled once per run: `getDraft` is a reactive query, and a seed taken
 * anywhere that re-runs would reshuffle the week under a user already reviewing it. `today` is
 * pinned on mount for the same reason — a run straddling midnight keeps the days it was offered.
 *
 * The run's diet and allergens go up as arguments, everything still ticked whoever it came from
 * (`runConstraintsOf`), rather than letting the server read the stored preferences the generating
 * step is writing at the same moment.
 *
 * Each meal lands as the server sent it, with its day made a `Date` and its plate named by
 * `plateIdFor` — see `DraftMeal`.
 */
export const usePlanDraft = ({ seed }: { seed: number }) => {
  const locale = useLocale();
  const { householdId } = useHousehold();
  const days = useAtomValue(daysAtom);
  const slots = useAtomValue(slotsAtom);
  const people = useAtomValue(peopleAtom);
  const constraints = useAtomValue(constraintsAtom);
  const [today] = useState(() => startOfDay(new Date()));

  /** Skipped until the constraint list is seeded: a draft for "nobody avoids anything" is not one to show. */
  const args = useMemo(() => {
    if (!householdId || constraints === null) return "skip" as const;

    return {
      householdId,
      locale,
      seed,
      servings: people,
      dates: planDates(today, days).map((date) => date.getTime()),
      slots,
      today: today.getTime(),
      ...runConstraintsOf(constraints),
    };
  }, [householdId, constraints, locale, seed, people, today, days, slots]);

  const { data, isPending, isError } = useQueryCached(api.router.planning.getDraft.authed, args);

  const meals = useMemo(
    (): DraftMeal[] =>
      (data ?? []).map((meal) => {
        const date = new Date(meal.date);

        return { ...meal, id: plateIdFor(date, meal.slot), date };
      }),
    [data],
  );

  return {
    meals,
    /** A failed generation is not still generating: the step moves on with an empty week rather than waiting forever. */
    isGenerating: args === "skip" || (isPending && !isError),
  };
};
