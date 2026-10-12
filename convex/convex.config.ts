import agent from "@convex-dev/agent/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import posthog from "@posthog/convex/convex.config";

// convex/convex.config.ts
import { defineApp } from "convex/server";
import { v } from "convex/values";

/**
 * `env` declares only what a component needs bound by reference. Our own functions read their
 * environment through `env.ts`, which validates it and throws at boot (ADR 0005).
 */
const app = defineApp({
  env: {
    POSTHOG_PROJECT_TOKEN: v.string(),
    POSTHOG_HOST: v.string(),
  },
});

app.use(agent);
app.use(migrations);
app.use(rateLimiter);
app.use(posthog, {
  env: {
    POSTHOG_PROJECT_TOKEN: app.env.POSTHOG_PROJECT_TOKEN,
    POSTHOG_HOST: app.env.POSTHOG_HOST,
  },
});

export default app;
