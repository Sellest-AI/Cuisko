/**
 * The sign-in sheet, by the path it is reached by. Here rather than in `auth-gate.tsx` so the
 * onboarding can name it without loading the gate.
 */
export const AUTH = { href: "/auth" } as const;

/**
 * Home, by the root stack's route name and its path: where a signed-out device done with the
 * onboarding stays, and where a sign-in ends, under the recipe that asked for it if one did.
 */
export const HOME = { name: "index", href: "/" } as const;
