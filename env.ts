import { z } from "zod";

/**
 * Client environment. Validated at module load — a misconfigured build refuses to start
 * rather than failing somewhere deep in a screen (P4).
 *
 * Expo inlines `process.env.EXPO_PUBLIC_*` as string literals at bundle time; the object
 * itself is never populated. So every key MUST be read explicitly below — a spread or a
 * dynamic lookup silently yields `undefined` on device.
 */
const schema = z.object({
  EXPO_PUBLIC_CONVEX_URL: z.url(),
});

const parsed = schema.safeParse({
  EXPO_PUBLIC_CONVEX_URL: process.env.EXPO_PUBLIC_CONVEX_URL,
});

if (!parsed.success) {
  throw new Error(
    "❌ Invalid client environment:\n" +
      parsed.error.issues.map((i) => `   ${i.path.join(".")}: ${i.message}`).join("\n") +
      "\n   See .env.example.",
  );
}

export const env = parsed.data;
