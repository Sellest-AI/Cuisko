/**
 * The PR file is what `pr:push` opens the PR with. A file read wrongly opens a PR into the wrong
 * base, or loses the agent's text when the Memory section is filled.
 */
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/prFile.mjs";

/** `prFile.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { parsePrFile, renderPrBody } = lib as unknown as {
  parsePrFile: (text: string) => { title: string; base: "dev" | "main"; body: string };
  renderPrBody: (body: string, options: { memory: string }) => string;
};

const BODY = "Fixes #12\n\n## Changed\nThe planner counts each egg once.\n";

describe("parsePrFile", () => {
  it("reads the title, the base and the body", () => {
    const text = `---\ntitle: "fix(planning): eggs counted twice on the week plan"\nbase: main\n---\n${BODY}`;
    expect(parsePrFile(text)).toEqual({ title: "fix(planning): eggs counted twice on the week plan", base: "main", body: BODY });
  });

  it("reads a file saved with a UTF-8 byte-order mark, as PowerShell's Out-File writes it", () => {
    expect(parsePrFile(`﻿---\ntitle: fix(planning): eggs\n---\n${BODY}`)).toEqual({ title: "fix(planning): eggs", base: "dev", body: BODY });
  });

  it("takes dev when the base is absent", () => {
    expect(parsePrFile(`---\ntitle: fix(planning): eggs\n---\n${BODY}`).base).toBe("dev");
  });

  it("refuses a file with no title", () => {
    expect(() => parsePrFile(`---\nbase: dev\n---\n${BODY}`)).toThrow(/no title/);
  });

  it("refuses a base other than dev and main", () => {
    expect(() => parsePrFile(`---\ntitle: fix: eggs\nbase: feat/recipes\n---\n${BODY}`)).toThrow(/base is "feat\/recipes"/);
  });

  it("refuses a file with no header, and a key it does not know", () => {
    expect(() => parsePrFile(BODY)).toThrow(/no header/);
    expect(() => parsePrFile(`---\ntitle: fix: eggs\nbas: main\n---\n${BODY}`)).toThrow(/"bas"/);
  });
});

describe("renderPrBody", () => {
  const MEMORY = "**planning**\n- added: Eggs are counted once per meal";

  it("fills an empty Memory section and keeps the sections after it", () => {
    const body = "Fixes #12\n\n## Memory\n(filled by pr:push)\n\n## How it was verified\nplanWeek.test.ts\n";
    expect(renderPrBody(body, { memory: MEMORY })).toBe(`Fixes #12\n\n## Memory\n\n${MEMORY}\n\n## How it was verified\nplanWeek.test.ts\n`);
  });

  it("replaces a filled one", () => {
    const once = renderPrBody(`${BODY}\n## Memory\n`, { memory: "No fact changed." });
    expect(renderPrBody(once, { memory: MEMORY })).toBe(`${BODY}\n## Memory\n\n${MEMORY}\n`);
  });

  it("adds it at the end when the body has none", () => {
    expect(renderPrBody(BODY, { memory: MEMORY })).toBe(`${BODY}\n## Memory\n\n${MEMORY}\n`);
  });
});
