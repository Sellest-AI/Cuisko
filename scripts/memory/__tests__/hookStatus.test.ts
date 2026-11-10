/**
 * The status line of the dream's commit (spec §9.1 U9): the last line the pre-commit printed, so
 * the owner sees one line and not the whole run.
 */
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/hookStatus.mjs";

type State = { last: string };
const { createLastLine, formatHookStatus } = lib as unknown as {
  createLastLine: () => { push: (chunk: string) => void; end: () => void; state: () => State };
  formatHookStatus: (state: State) => string;
};

describe("createLastLine", () => {
  it("keeps the last line that is not blank", () => {
    const lastLine = createLastLine();
    lastLine.push("→ pre-commit: memory commit, pnpm check:memory\n\n   \n");
    expect(lastLine.state()).toEqual({ last: "→ pre-commit: memory commit, pnpm check:memory" });
  });

  it("reads a line cut across two chunks once, and strips colour codes", () => {
    const lastLine = createLastLine();
    lastLine.push("\u001b[32m✅ C20 agent");
    lastLine.push(" memory integrity\u001b[39m\n✓ pre-commit");
    expect(lastLine.state()).toEqual({ last: "✅ C20 agent memory integrity" });
    lastLine.end();
    expect(lastLine.state().last).toBe("✓ pre-commit");
  });
});

describe("formatHookStatus", () => {
  it("shows the last line, or the label alone before any", () => {
    expect(formatHookStatus({ last: "✓ pre-commit: clean" })).toBe("Verifying · ✓ pre-commit: clean");
    expect(formatHookStatus({ last: "" })).toBe("Verifying");
  });
});
