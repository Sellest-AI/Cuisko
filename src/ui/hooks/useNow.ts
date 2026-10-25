import { useEffect, useState } from "react";

/**
 * The time, re-read once a second while `isActive`: what a countdown or a time bar draws from.
 *
 * Stopped when nothing needs it, so a screen with nothing running does not re-render each second.
 * The value is the last tick's, which can be up to a second older than something that started since:
 * a caller that measures from a start time reads `Math.max(now, startedAt)`.
 */
export const useNow = (isActive: boolean): number => {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!isActive) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  return now;
};
