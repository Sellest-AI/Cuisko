import { useEffect, useState } from "react";

import { UNDO_WINDOW_MS, type Receipt } from "../_model/model";

/**
 * The clock the undo window is read against.
 *
 * A receipt going stale changes what is on screen — the cellar row stops being undoable, so it is
 * drawn as settled and the sheet stops offering the purchase back — but nothing tells React that a
 * moment has passed. So this re-renders on the only moments that matter: it sleeps until the next
 * receipt expires, wakes, and sleeps again. An interval would poll a value that changes at most
 * once every five minutes.
 *
 * Returns a `Date` rather than a tick count so callers can pass it straight into a `Snapshot`.
 */
export const useLiveWindow = (receipts: Receipt[]) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const nextExpiry = receipts.reduce<number | null>((soonest, receipt) => {
      const expiresAt = receipt.at.getTime() + UNDO_WINDOW_MS;

      if (expiresAt <= now.getTime()) return soonest;

      return soonest === null || expiresAt < soonest ? expiresAt : soonest;
    }, null);

    /** Nothing live: the next change can only come from a purchase, which re-runs this anyway. */
    if (nextExpiry === null) return;

    const timer = setTimeout(() => setNow(new Date()), Math.max(0, nextExpiry - Date.now()));

    return () => clearTimeout(timer);
  }, [receipts, now]);

  return now;
};
