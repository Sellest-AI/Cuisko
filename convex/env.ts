import { z } from "zod";

/**
 * Backend environment. Validated at module load and THROWS — a deployment missing a
 * secret refuses to start rather than coming up with that secret's check disabled (P4).
 *
 * Three rules follow from this file, and they are not negotiable:
 *
 *  1. Never `?? ''`. A falsy default turns a missing secret into a disabled check.
 *  2. Optional means `.optional()`, so the type is `string | undefined` and every caller
 *     is forced by TypeScript to handle absence.
 *  3. Never gate a security check on its secret being truthy (`if (secret) verify()`).
 *     If the secret is required, the schema below has already guaranteed it exists.
 *
 * Add a key here in the same commit as the code that reads it — not before. An unused
 * required key blocks every deployment for no benefit.
 */
const schema = z.object({
  /** Set automatically by Convex on every deployment. */
  CONVEX_SITE_URL: z.url(),
  /** Authenticates `server` procedures. `npx convex env set SERVER_PRIVATE_KEY ...` */
  SERVER_PRIVATE_KEY: z.string().min(32),
  OPENROUTER_API_KEY: z.string().min(32),
});

const parsed = schema.safeParse({
  SERVER_PRIVATE_KEY: process.env.SERVER_PRIVATE_KEY,
  CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
});

if (!parsed.success) {
  throw new Error(
    "❌ Invalid Convex environment:\n" +
    parsed.error.issues.map((i) => `   ${i.path.join(".")}: ${i.message}`).join("\n"),
  );
}

export const env = parsed.data;
