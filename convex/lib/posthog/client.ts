import { components } from "@convex/_generated/api";
import { PostHog } from "@posthog/convex";

/**
 * The one PostHog client on the backend, over the `@posthog/convex` component.
 *
 * `capture` schedules the component's own action rather than POSTing inline, so the caller never
 * waits on PostHog and a PostHog outage cannot fail the operation that reported to it. The token
 * and host are bound in `convex.config.ts`; nothing here reads them.
 */
export const posthog = new PostHog(components.posthog);
