import { recipeScreenAt } from "~/modules/recipes/routes";

/** The onboarding, and the sign-in sheet its first step opens (`auth-gate`). */
const _AUTH_FLOW = /^\/(?:auth|onboarding)(?:\/|$)/;

/**
 * Whether a page belongs to signing in: `/auth`, or a step of the onboarding.
 *
 * What opens over a page from outside (a shared link's sheet) waits until the cook is past these:
 * the gate resets the navigator when it moves a sign-in on to home, which would close it.
 */
export const isAuthFlowPath = (pathname: string): boolean => _AUTH_FLOW.test(pathname);

/**
 * Whether someone with no account may stay on a page whatever the device remembers: the recipe a
 * shared link opens. Home is the other page open to them, once the onboarding is walked, which the
 * gate decides; every other page sends them home, or to the onboarding.
 */
export const isGuestPath = (pathname: string): boolean => recipeScreenAt(pathname) !== undefined;
