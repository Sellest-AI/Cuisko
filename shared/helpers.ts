/** use this like that : array.filter(notEmpty) */
export function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

type ArrayType = string | number | boolean | symbol | bigint | Date;
export const uniqueArray = <T extends ArrayType>(array: T[]) => Array.from(new Set(array));

export const shuffleArray = <T>(array: T[], key: string): T[] => {
  const result = [...array];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = Math.imul(31, hash) + key.charCodeAt(i) | 0;
  const random = () => (hash = Math.imul(hash ^ hash >>> 15, hash | 1), ((hash ^= hash + Math.imul(hash ^ hash >>> 7, hash | 61)) ^ hash >>> 14) >>> 0) / 4294967296;
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i]!, result[j]!] = [result[j]!, result[i]!];
  }
  return result;
}


/**
 * Removes undefined values from an object recursively
 * @param obj The object to process
 * @returns A new object without properties that have undefined values
 */
export function removeUndefinedKeys<T extends object>(obj: T): Partial<T> {
  if (Array.isArray(obj)) {
    return obj
      .filter(item => item !== undefined)
      .map(item =>
        item !== null && typeof item === "object"
          ? removeUndefinedKeys(item as object)
          : item
      ) as unknown as Partial<T>;
  }

  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        value !== null && typeof value === "object"
          ? removeUndefinedKeys(value as object)
          : value
      ])
  ) as Partial<T>;
}

/**
 * Converts all null values in an object to undefined recursively
 * @param obj The object to process
 * @returns A new object with null values converted to undefined
 */
export function turnNullKeysToUndefined<T extends object>(obj: T): {
  [K in keyof T]: T[K] extends null ? undefined :
  T[K] extends (infer U | null) ? U | undefined :
  T[K] extends object ? ReturnType<typeof turnNullKeysToUndefined<T[K]>> :
  T[K]
} {
  if (Array.isArray(obj)) {
    return obj.map(item =>
      item === null
        ? undefined
        : item !== null && typeof item === "object"
          ? turnNullKeysToUndefined(item as object)
          : item
      // Need to cast to any because TypeScript cannot infer the correct type for arrays with null values
    ) as any;
  }

  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key,
      value === null
        ? undefined
        : value !== null && typeof value === "object"
          ? turnNullKeysToUndefined(value as object)
          : value
    ])
    // Need to cast to any because TypeScript cannot infer the correct type for objects with null values
  ) as any;
}

export const prismaToConvex = <T extends object>(obj: T) => turnNullKeysToUndefined(removeUndefinedKeys(obj));

export type Nullable<T> = T | null | undefined;

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

      if (attempt === attempts || !shouldRetry(error)) break;

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
