import { useEffect, useState } from "react";

/**
 * The clock the screen's time-sensitive rules are read against.
 *
 * Two things on this screen change on their own: a receipt goes stale, so the cellar row stops
 * being undoable and the sheet stops offering the purchase back; and a row finishes settling, so
 * it leaves the recency sort and takes its alphabetical place. Neither is a state change anybody
 * dispatches — a moment simply passes, and nothing tells React.
 *
 * So the caller hands over every moment it would want redrawing at, and this sleeps until the
 * soonest one that is still ahead, wakes, and sleeps again. An interval would poll a value that
 * usually does not change for minutes at a time.
 *
 * **Deadlines, not the things they belong to.** It used to take `Receipt[]` and derive the expiry
 * itself, which quietly made undo the only rule that could move the clock: a shopper who added
 * lines and bought nothing armed no timer at all, so `now` stayed at mount for the whole session
 * and every age `_compare` measured against it was frozen. Rows never crossed the settling
 * threshold, and a line added after mount reported a *negative* age — later than "now" — pinning
 * it to the head of its section for good. A list of numbers has no such preference about which
 * rule matters.
 *
 * Returns a `Date` rather than a tick count so callers can pass it straight into a `Snapshot`.
 */
export const useLiveWindow = (deadlines: number[]) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const soonest = deadlines.reduce<number | null>((earliest, deadline) => {
      /** Already passed: this moment is in the clock we are holding, not ahead of it. */
      if (deadline <= now.getTime()) return earliest;

      return earliest === null || deadline < earliest ? deadline : earliest;
    }, null);

    /** Nothing ahead: the next change can only come from a write, which re-runs this anyway. */
    if (soonest === null) return;

    const timer = setTimeout(() => setNow(new Date()), Math.max(0, soonest - Date.now()));

    return () => clearTimeout(timer);
  }, [deadlines, now]);

  return now;
};
