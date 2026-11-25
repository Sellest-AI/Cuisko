import { atom } from "jotai";

/**
 * The page someone was reading with no account when they went to sign in, reopened when the
 * onboarding ends. Held by `useRequireSignIn`, taken by `useTakeReturnPath`.
 *
 * @limitation In memory only: an app killed during the sign-in or the onboarding, and the web's
 * full-page redirect to a provider, lose it. **Accepted because** the link they came by still opens
 * the recipe. **Until fixed**, the onboarding ends on the assistant for them, as for anyone else.
 * **The fix** is the same string in device storage, with an age limit.
 */
export const returnPathAtom = atom<string | undefined>(undefined);

/** Reads the held page and forgets it, in one write: it is returned to once. */
export const takeReturnPathAtom = atom(null, (get, set) => {
  const path = get(returnPathAtom);
  set(returnPathAtom, undefined);
  return path;
});
