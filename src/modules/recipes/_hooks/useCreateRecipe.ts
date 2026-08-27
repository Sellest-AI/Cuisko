import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import type { FunctionArgs } from "convex/server";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useAction } from "~/lib/convex/client";

import { DEFAULT_ESTIMATE_MS, phaseAt, sweepFor } from "../_model/progress";

/** Everything the editor collected. The locale is the hook's to add, not the screen's to know. */
export type RecipeDraft = Omit<
  FunctionArgs<typeof api.router.recipes.createOne.authed>,
  "locale"
>;

/**
 * How often the sweep is recomputed.
 *
 * Not a frame rate: the curve crosses its whole range over tens of seconds, so ten steps a second
 * is already finer than the ring can show. Anything faster would be a timer waking the JS thread
 * sixty times a second to redraw an arc that moved a third of a pixel.
 */
const TICK_MS = 100;

/**
 * `idle` and `failed` both mean the editor is answerable again; they differ only in whether there
 * is something to say about why. `done` is the moment between the recipe existing and the screen
 * changing — the overlay must not lift during it, or the form flashes back before the route does.
 */
type Status = "idle" | "creating" | "done" | "failed";

/**
 * A field left blank is a field not answered, not a field answered with nothing.
 *
 * It matters for `title` in particular: absent, the agent words one from the recipe, and `""` would
 * instead store a recipe whose name is the empty string — a card with a blank line where its title
 * goes. Applied here rather than at the call site because it is a property of the draft, and a
 * screen that has to remember it is a screen that will eventually forget.
 */
const _omitBlank = (value?: string) => value?.trim() || undefined;

/**
 * Writing the recipe, and the wait that comes with it.
 *
 * The action is a single `await` on an agent that reports nothing, so the progress here is
 * estimated rather than measured — see `_model/progress.ts` for why that is honest and where the
 * cap comes from. Everything this hook adds around it is the clock: when it started, what the
 * curve says now, and when to stop asking.
 *
 * **It navigates on success, and that is deliberate.** `createOne` schedules the translation rather
 * than awaiting it, so the id comes back with the recipe existing in one language only — there is
 * nothing left to wait for and nothing for the editor to decide. `replace` rather than `push`, so
 * Back returns to the list and not to a form that has already been submitted.
 *
 * A failure leaves the cook on their own typed text with nothing lost. That is also why the overlay
 * covers the editor rather than replacing it, and why there is no `creating` route.
 */
export const useCreateRecipe = ({ estimateMs = DEFAULT_ESTIMATE_MS }: { estimateMs?: number } = {}) => {
  const locale = useLocale();
  const { action } = useAction(api.router.recipes.createOne.authed);

  const [status, setStatus] = useState<Status>("idle");
  const [startedAt, setStartedAt] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (status !== "creating") return;

    /**
     * Fitted once per wait rather than per tick, and read from the clock rather than from the
     * previous value: a counter incremented on each tick drifts with every frame the JS thread
     * misses, and a backgrounded app misses all of them.
     */
    const sweep = sweepFor(estimateMs);
    const tick = () => setProgress(sweep(Date.now() - startedAt));

    tick();
    const timer = setInterval(tick, TICK_MS);

    return () => clearInterval(timer);
  }, [status, startedAt, estimateMs]);

  const create = useCallback(
    async (draft: RecipeDraft) => {
      /**
       * One write at a time, guarded here rather than by whoever drew the button.
       *
       * A second call before the first resolves would restart the clock — the ring visibly jumping
       * backwards — and run the sanitize agent twice, leaving the cook two copies of one recipe and
       * two `replace` calls racing for the route. The editor disables its actions, but this hook is
       * the module's public API and the next screen to call it should inherit the guarantee rather
       * than have to remember the discipline.
       */
      if (status === "creating") return;

      setError(null);
      setProgress(0);
      setStartedAt(Date.now());
      setStatus("creating");

      try {
        const recipeId = await action({
          ...draft,
          title: _omitBlank(draft.title),
          description: _omitBlank(draft.description),
          locale,
        });

        /** The only place 1 is ever reached: the curve itself is capped well below it. */
        setProgress(1);
        setStatus("done");
        router.replace(`/recipe/${recipeId}`);
      } catch (caught) {
        setError(caught);
        setStatus("failed");
        setProgress(0);
      }
    },
    [action, locale, status],
  );

  return {
    create,
    /** `done` counts: the recipe exists, but the editor is still the thing on screen. */
    isCreating: status === "creating" || status === "done",
    progress,
    phase: phaseAt(progress),
    error,
  };
};
