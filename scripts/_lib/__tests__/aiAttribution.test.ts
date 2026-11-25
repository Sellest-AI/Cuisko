/**
 * One list of patterns serves commitlint, a CommonJS config, and the pull request check, ES modules.
 * A pattern lost from it lets an AI signature through both.
 */
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import * as lib from "../aiAttribution.cjs";

/** `aiAttribution.cjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { findAiAttribution } = lib as unknown as { findAiAttribution: (text: string) => RegExp[] };

type Rules = { "no-ai-attribution": (commit: { raw: string | null }) => [boolean, string] };
/** The real config, loaded as commitlint loads it. */
const config = createRequire(import.meta.url)("../../../commitlint.config.js") as { plugins: [{ rules: Rules }] };
const rule = config.plugins[0].rules["no-ai-attribution"];

const SIGNED = [
  "Co-Authored-By: Claude Opus <someone@example.com>",
  "Co-authored-by: Someone <noreply@anthropic.com>",
  "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
  "Claude-Session: https://claude.ai/code/session_01AbC",
];

describe("findAiAttribution", () => {
  it("finds each form on its own", () => {
    for (const line of SIGNED) expect(findAiAttribution(line), line).toHaveLength(1);
  });

  it("finds every pattern a text carries", () => {
    expect(findAiAttribution(SIGNED.join("\n"))).toHaveLength(4);
  });

  it("leaves a human co-author and a mention of the tool alone", () => {
    expect(findAiAttribution("Co-authored-by: Ada <ada@example.com>\nClaude Code reads settings.json")).toEqual([]);
  });
});

describe("commitlint's no-ai-attribution", () => {
  it("refuses a message carrying any form", () => {
    for (const line of SIGNED) expect(rule({ raw: `fix(planning): count eggs once\n\n${line}` })[0], line).toBe(false);
  });

  it("accepts a plain message, and one with no text", () => {
    expect(rule({ raw: "fix(planning): count eggs once\n\nFixes #12" })[0]).toBe(true);
    expect(rule({ raw: null })[0]).toBe(true);
  });
});
