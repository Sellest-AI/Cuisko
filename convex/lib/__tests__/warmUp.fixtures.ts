// The second dot in this file's name is load-bearing, as in `rateLimiter.fixtures.ts`.

/** `router/users/getAccount`, which `procedures.ts` runs through a string reference. */
const GET_ACCOUNT = "/convex/router/users/getAccount.";

/**
 * The warm-up of a file calling an action behind an identity check — C10 rule 5. An action has no
 * `ctx.db`, so `auth*Action` and `admin*Action` load the caller through `getAccount`, which no test
 * names: left cold, the first signed-in call pays for it against its own timeout. `prefixes` are the
 * modules the file itself reaches, `/convex/<path>.` with the trailing dot, read by C10.
 */
export const warmActions = (modules: Record<string, () => Promise<unknown>>, ...prefixes: string[]) =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => [GET_ACCOUNT, ...prefixes].some((prefix) => path.startsWith(prefix)))
      .map(([, load]) => load()),
  );
