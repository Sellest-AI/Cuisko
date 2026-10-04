/** The sign-in page, and the onboarding every sign-in walks after it (`auth-gate`). */
const _AUTH_FLOW = /^\/(?:auth|onboarding)(?:\/|$)/;

/**
 * Whether a page belongs to signing in: `/auth`, or a step of the onboarding.
 *
 * What opens over a page from outside (a shared link's sheet) waits until the cook is past these:
 * the gate resets the navigator when it moves a sign-in on to the onboarding, which would close it.
 */
export const isAuthFlowPath = (pathname: string): boolean => _AUTH_FLOW.test(pathname);
