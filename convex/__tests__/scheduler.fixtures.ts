import type { TestConvex } from "convex-test";
import { vi } from "vitest";

// The second dot in this file's name keeps it off every deployment: the Convex CLI skips any file
// whose name has more than one, and this one imports `vitest`.

/**
 * Run every scheduled function a test left behind, and wait for them to finish.
 *
 * A job left pending outlives its test: it fires after Vitest has torn the module graph down, and
 * a slow runner logs the failed import as an `EnvironmentTeardownError` while the test itself
 * passes. Draining it here also makes what the job did assertable.
 *
 * Fake timers only for the drain: `finishAllScheduledFunctions` advances them itself. They are
 * restored even when the drain throws, or every later test in the file would run on a clock that
 * never moves and fail for a reason that is not theirs.
 */
export const drainScheduled = async (t: Pick<TestConvex<never>, "finishAllScheduledFunctions">) => {
  vi.useFakeTimers();
  try {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
};
