/**
 * The dream's steps on the owner's terminal (spec §9.1 U5): the running step on the status line,
 * with its agents counted, and one line per step that ended.
 */
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/steps.mjs";

type Steps = { step: (message: string, total?: number) => void; finished: () => void; end: () => void; fail: () => void };
const { createSteps } = lib as unknown as {
  createSteps: (input: { status?: (text: string | null) => void; out: (text: string) => void; clock?: () => number }) => Steps;
};

const makeTerminal = () => {
  const statuses: (string | null)[] = [];
  const lines: string[] = [];
  let ms = 0;
  const steps = createSteps({ status: (text) => void statuses.push(text), out: (text) => void lines.push(text), clock: () => ms });
  return { steps, statuses, lines, wait: (seconds: number) => void (ms += seconds * 1000) };
};

describe("createSteps", () => {
  it("counts the agents a step runs, and prints the step with its duration when the next starts", () => {
    const t = makeTerminal();
    t.steps.step("P2  extracting from 3 conversation(s)", 3);
    t.steps.finished();
    t.wait(41);
    t.steps.step("P3  planning from 7 candidate(s)");

    expect(t.statuses).toEqual(["P2  extracting from 3 conversation(s) · 0/3", "P2  extracting from 3 conversation(s) · 1/3", null, "P3  planning from 7 candidate(s)"]);
    expect(t.lines).toEqual(["✓ P2  extracting from 3 conversation(s) (41s)"]);
  });

  it("marks a failed step with ✗, and prints nothing more once no step runs", () => {
    const t = makeTerminal();
    t.steps.step("P3  planning from 7 candidate(s)");
    t.steps.fail();
    t.steps.end();
    t.steps.finished();

    expect(t.lines).toEqual(["✗ P3  planning from 7 candidate(s) (0s)"]);
    expect(t.statuses.at(-1)).toBeNull();
  });
});
