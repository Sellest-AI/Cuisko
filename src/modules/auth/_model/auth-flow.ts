import { recipeScreenAt } from "~/modules/recipes/routes";

/** The onboarding, and the sign-in page it ends on (`auth-gate`). */
const _AUTH_FLOW = /^\/(?:auth|onboarding)(?:\/|$)/;

/**
 * Whether a page belongs to signing in: `/auth`, or a step of the onboarding.
 *
 * What opens over a page from outside (a shared link's sheet) waits until the cook is past these:
 * the gate resets the navigator when it moves a sign-in on to home, which would close it.
 */
export const isAuthFlowPath = (pathname: string): boolean => _AUTH_FLOW.test(pathname);

/**
 * Whether someone with no account may stay on a page: the recipe a shared link opens, and nothing
 * else. Every other page sends them to the onboarding, or to sign in.
 */
export const isGuestPath = (pathname: string): boolean => recipeScreenAt(pathname) !== undefined;
