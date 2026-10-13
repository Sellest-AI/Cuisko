/**
 * C18's own tests.
 *
 * The check keeps product events at the entry points ADR 0019 names. The first case is the shape it
 * exists for, a domain writer reporting its own change, which is how `addToCellar` once needed the
 * cook as an argument it had no other use for; if C18 ever stops failing it, that test goes red.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

const SCRIPT = "c18-event-senders.mjs";

const CAPTURE_EVENT = `
import { posthog } from "./client";
export const captureEvent = async (ctx, event) => posthog.capture(ctx, event);
`;

afterEach(cleanupTrees);

describe("an event sent from the domain", () => {
  it("rejects a functions/ writer that imports captureEvent", () => {
    const { code, output } = runCheck(SCRIPT, {
      "convex/lib/posthog/captureEvent.ts": CAPTURE_EVENT,
      "convex/functions/cellars/addToCellar.ts": `
        import { captureEvent } from "@convex/lib/posthog/captureEvent";

        export const addToCellar = async (ctx, args) => {
          await captureEvent(ctx, { event: "food added to cellar", distinctId: args.actor, properties: {} });
        };
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/functions/cellars/addToCellar.ts:2");
    expect(output).toContain("outside an entry point");
  });

  it("rejects it reached by a relative path too", () => {
    const { code, output } = runCheck(SCRIPT, {
      "convex/lib/posthog/captureEvent.ts": CAPTURE_EVENT,
      "convex/functions/users/requestDeletion.ts": `
        import { captureEvent } from "../../lib/posthog/captureEvent";
        export const requestDeletion = async (ctx) => captureEvent(ctx, {});
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/functions/users/requestDeletion.ts:2");
  });

  /** A barrel would hand the sender on, and the domain file importing from it names no posthog path. */
  it("rejects captureEvent re-exported from the domain", () => {
    const { code, output } = runCheck(SCRIPT, {
      "convex/lib/posthog/captureEvent.ts": CAPTURE_EVENT,
      "convex/functions/analytics/index.ts": `
        export { captureEvent } from "@convex/lib/posthog/captureEvent";
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/functions/analytics/index.ts:2");
  });

  it("rejects captureEvent loaded with a dynamic import", () => {
    const { code, output } = runCheck(SCRIPT, {
      "convex/lib/posthog/captureEvent.ts": CAPTURE_EVENT,
      "convex/functions/cellars/addToCellar.ts": `
        export const addToCellar = async (ctx) => {
          const { captureEvent } = await import("@convex/lib/posthog/captureEvent");
          await captureEvent(ctx, {});
        };
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/functions/cellars/addToCellar.ts:3");
  });

  it("rejects the PostHog client imported anywhere but its two senders", () => {
    const { code, output } = runCheck(SCRIPT, {
      "convex/lib/posthog/captureEvent.ts": CAPTURE_EVENT,
      "convex/router/planning/cookOne.ts": `
        import { posthog } from "@convex/lib/posthog/client";
        export const authed = householdMutation({ args: {}, handler: (ctx) => posthog.capture(ctx, {}) });
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/router/planning/cookOne.ts:2");
    expect(output).toContain("imports the PostHog client directly");
  });
});

describe("an event sent from an entry point", () => {
  it("accepts a router, a cron job, a webhook, the sign-in callback, and the two client holders", () => {
    const { code } = runCheck(SCRIPT, {
      "convex/lib/posthog/captureEvent.ts": CAPTURE_EVENT,
      "convex/crons/expireCellar.ts": `import { captureEvent } from "@convex/lib/posthog/captureEvent";`,
      "convex/http/stripe.ts": `import { captureEvent } from "../lib/posthog/captureEvent";`,
      "convex/functions/tracing/recordGeneration.ts": `import { posthog } from "@convex/lib/posthog/client";`,
      "convex/router/planning/cookOne.ts": `import { captureEvent } from "@convex/lib/posthog/captureEvent";`,
      "convex/auth.ts": `import { captureEvent } from "./lib/posthog/captureEvent";`,
    });

    expect(code).toBe(0);
  });

  /** A type cannot send anything; the event shapes live in schema/events.ts besides. */
  it("accepts a type-only import or re-export from the domain", () => {
    const { code } = runCheck(SCRIPT, {
      "convex/lib/posthog/captureEvent.ts": CAPTURE_EVENT,
      "convex/functions/users/accountEvent.ts": `import type { captureEvent } from "@convex/lib/posthog/captureEvent";`,
      "convex/functions/users/types.ts": `export type { captureEvent } from "@convex/lib/posthog/captureEvent";`,
    });

    expect(code).toBe(0);
  });

  it("ignores tests, which mock the client", () => {
    const { code } = runCheck(SCRIPT, {
      "convex/functions/cellars/__tests__/addToCellar.test.ts": `import { posthog } from "@convex/lib/posthog/client";`,
    });

    expect(code).toBe(0);
  });
});
