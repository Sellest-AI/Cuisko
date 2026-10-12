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
  /** The public URL of the site: the only web origin a sign-in may redirect to (`lib/authRedirect.ts`). */
  SITE_URL: z.url(),
  /** Google OAuth credentials, read by `auth.ts`. */
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  /** Authenticates `server` procedures. `npx convex env set SERVER_PRIVATE_KEY ...` */
  SERVER_PRIVATE_KEY: z.string().min(32),
  OPENROUTER_API_KEY: z.string().min(32),
  REPLICATE_API_KEY: z.string().min(32),
  RUNPOD_API_KEY: z.string().min(32),
  /**
   * USDA FoodData Central, read by `functions/ingredients/lookup/foodDataCentral.ts` when a
   * shopper types an ingredient the catalog and the two shipped datasets cannot name.
   *
   * Required, not optional. It is free and self-issued at `https://fdc.nal.usda.gov/api-key-signup`,
   * so a deployment missing it is a deployment somebody forgot to configure — and the symptom of
   * letting it through would be the long tail silently resolving one source short, which nothing
   * would report. `npx convex env set FDC_API_KEY ...`
   */
  FDC_API_KEY: z.string().min(1),
  // S3 Storage
  S3_ENDPOINT: z.string().min(1),
  S3_APP_KEY_ID: z.string().min(1),
  S3_APP_KEY: z.string().min(1),
  S3_DEFAULT_BUCKET: z.string().min(1),
  /**
   * PostHog, read by the `@posthog/convex` component through the binding in `convex.config.ts`,
   * never by our code. Validated here anyway: the component returns silently when its token is
   * missing, so a deployment without it would lose every cost event and report nothing.
   * The project token is public by design (the app ships the same one).
   * `npx convex env set POSTHOG_PROJECT_TOKEN phc_...`
   */
  POSTHOG_PROJECT_TOKEN: z.string().startsWith("phc_"),
  /** `https://eu.i.posthog.com`: the project lives in the EU region, like the app's client. */
  POSTHOG_HOST: z.url(),
});

const parsed = schema.safeParse({
  SITE_URL: process.env.SITE_URL,
  SERVER_PRIVATE_KEY: process.env.SERVER_PRIVATE_KEY,
  CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
  RUNPOD_API_KEY: process.env.RUNPOD_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  REPLICATE_API_KEY: process.env.REPLICATE_API_KEY,
  FDC_API_KEY: process.env.FDC_API_KEY,
  // S3 Storage
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_APP_KEY_ID: process.env.S3_APP_KEY_ID,
  S3_APP_KEY: process.env.S3_APP_KEY,
  S3_DEFAULT_BUCKET: process.env.S3_DEFAULT_BUCKET,
  // Google
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
  AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
  // PostHog
  POSTHOG_PROJECT_TOKEN: process.env.POSTHOG_PROJECT_TOKEN,
  POSTHOG_HOST: process.env.POSTHOG_HOST,
});

if (!parsed.success) {
  throw new Error(
    "❌ Invalid Convex environment:\n" +
    parsed.error.issues.map((i) => `   ${i.path.join(".")}: ${i.message}`).join("\n"),
  );
}

export const env = parsed.data;
