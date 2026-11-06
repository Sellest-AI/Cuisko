/** use this like that : array.filter(notEmpty) */
export function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

/**
 * Runs `fn`, and runs it again if it threw.
 *
 * The last failure is what gets rethrown, wrapped in `cause` rather than summarized. A helper that
 * throws "failed after 3 attempts" makes a bad API key and a dropped connection the same event at
 * the call site, which is the one place the difference matters — the first is a deploy to fix and
 * the second is a retry that should have worked.
 *
 * `shouldRetry` is how a caller says which failures are worth repeating. It defaults to "all of
 * them" because that is what a network call wants, but anything that validates its input should
 * narrow it: a schema rejection or a 401 fails identically ten times and only costs latency, or
 * money, on the way to the same answer.
 *
 * Attempts, not retries: `attempts = 1` runs `fn` once and does not retry. The delay is jittered
 * and only ever waits BETWEEN attempts — sleeping after the last one delays the throw and changes
 * nothing else.
 */
export async function retryPromise<T>(
  fn: () => Promise<T>,
  attempts = 10,
  shouldRetry: (error: unknown) => boolean = () => true,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // A failure the caller declined to retry is not a retry failure — it is that failure, and
      // wrapping it would bury the 401 under a message about ten attempts that never happened.
      if (!shouldRetry(error)) throw error;

      if (attempt === attempts) break;

      // Jittered, so a batch of calls failing together does not retry in lockstep.
      const delay = Math.floor(Math.random() * (350 - 150 + 1)) + 150;
      console.warn(`Attempt ${attempt}/${attempts} failed, retrying in ${delay}ms:`, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // `cause` is assigned rather than passed to the constructor: the two-argument `Error` is ES2022
  // and this file compiles against an older lib, while the property itself is read the same way.
  const failure: Error & { cause?: unknown } = new Error(`Failed after ${attempts} attempt(s)`);
  failure.cause = lastError;

  throw failure;
}

/**
 * Turn an id on or off in a list of them, keeping the order they were picked in.
 *
 * Generic in the id so a caller holding a narrower one keeps it: the week step's slots are
 * `MealSlot`, and a `string` here would let a typo'd slot compile. Shared rather than kept in one
 * module's `_model/` because every chip row that answers "which of these" needs it — the planning
 * tunnel, the preferences sheet and the recipe editor — and the second copy is where they would drift.
 */
export const toggle = <T extends string>(list: readonly T[], id: T): T[] =>
  list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
