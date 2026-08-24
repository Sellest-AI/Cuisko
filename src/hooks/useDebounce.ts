import { useEffect, useState } from "react";

/**
 * The value, but only once it has stopped changing.
 *
 * For text the user is still typing: every keystroke would otherwise be a query, and the answer to
 * a prefix nobody meant to search for is work the server does and the screen throws away.
 *
 * It settles rather than throttles — a fast typist issues one query at the end of the word, not one
 * every `delay` ms through it. The trailing edge is the only one that matters here, because the
 * answer to "carro" is never the answer the shopper wanted.
 *
 * Debouncing alone does not stop a list from flashing empty while the new answer is in flight; it
 * only makes it happen less often. Holding the previous result is what fixes that — see
 * `useQueryHeld`.
 */
export const useDebounce = <T,>(value: T, delay = 200): T => {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
};
