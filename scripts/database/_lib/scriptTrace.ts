/**
 * The trace a script's call into a paid internal action is recorded under in PostHog.
 *
 * An internal action starts no trace of its own, and a script is no route, so the script passes one
 * as `__trace`: its own operation, and no cook (`distinctId: null`, so PostHog makes no person of
 * it). A new trace per call, so the cost averages per recipe or ingredient rather than per run.
 */
import { randomUUID } from "node:crypto";

import type { Operation, TraceContext } from "@convex/schema/tracing";

export const scriptTrace = (operation: Extract<Operation, `${"seed" | "restore" | "verify"}/${string}`>): TraceContext => ({
  traceId: randomUUID(),
  operation,
  distinctId: null,
});
