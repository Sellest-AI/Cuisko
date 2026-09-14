type Options = {
  alphabet?: string;
}

export const nanoid = (length: number = 21, options?: Options): string => {
  const alphabet = options?.alphabet || "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let id = "";

  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < length; i++) {
    id += alphabet[(randomValues[i] ?? 0) % alphabet.length];
  }

  return id;
}

/**
 * A random integer used as a stable ordering key for the planning candidate window.
 *
 * The key is sampled from the full 32-bit range so an index range read can pick a random
 * starting point and walk forward — a seeded cursor, which is the closest thing Convex has
 * to a random sample. It is an `int`, not a float: a float's precision is wasted on a key
 * that is only ever compared for ordering, and an integer is what the database displays.
 */
export const randomShuffleKey = (): number => {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] ?? 0;
};
