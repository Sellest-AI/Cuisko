/**
 * Where the auth gate sends a signed-out cook: the root stack's route name, and the path it is
 * reached by. Here rather than in `auth-gate.tsx` so analytics can name it without loading the gate.
 */
export const AUTH = { name: "auth", href: "/auth" } as const;
