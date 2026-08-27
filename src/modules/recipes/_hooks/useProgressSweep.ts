import { useCallback, useEffect, useState } from "react";

import { sweepFor } from "../_model/progress";

/**
 * How often the sweep is recomputed.
 *
 * Not a frame rate: the curve crosses its whole range over tens of seconds, so ten steps a second
 * is already finer than the ring can show. Anything faster would be a timer waking the JS thread
 * sixty times a second to redraw an arc that moved a third of a pixel.
 */
const TICK_MS = 100;

/**
 * The clock behind an estimated wait — one write or the other of the recipe editor, so far.
 *
 * Extracted out of `useCreateRecipe` rather than left there and pasted a second time into
 * `useUpdateRecipe`: both hooks run the exact same sweep over the exact same kind of wait, and a
 * clock kept in two places is a clock that can drift when only one copy is tuned. The state
 * machine around it — what counts as "creating" versus "updating", when to navigate, what a
 * failure resets — stays with each caller, because that part genuinely differs.
 *
 * `active` starts and stops the ticking; `start` resets the clock to the current moment, which the
 * caller runs at the same time it flips `active` on.
 */
export const useProgressSweep = (active: boolean, estimateMs: number) => {
  const [startedAt, setStartedAt] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) return;

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
  }, [active, startedAt, estimateMs]);

  const start = useCallback(() => {
    setProgress(0);
    setStartedAt(Date.now());
  }, []);

  return { progress, setProgress, start };
};
