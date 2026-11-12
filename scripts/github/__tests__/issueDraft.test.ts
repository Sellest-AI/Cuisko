/**
 * The issue draft is what the owner's click turns into an issue. A draft read wrongly creates an
 * issue with no type or the wrong area, and an env passed on wrongly creates it as the bot.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/issueDraft.mjs";

type Draft = { title: string; type: string; areas: string[]; body: string };
/** `issueDraft.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { parseDraft, issueArgs, ownerEnv } = lib as unknown as {
  parseDraft: (text: string, options: { labels: { group: string; name: string }[] }) => Draft;
  issueArgs: (draft: Omit<Draft, "body">) => string[];
  ownerEnv: (env: Record<string, string | undefined>) => Record<string, string | undefined>;
};

/** The real label set: a type or an area the file drops stops being accepted here too. */
const labels = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "..", "..", ".github", "labels.json"), "utf8"));
const BODY = "### What happened\nThe week plan lists 4 eggs to buy; 2 are owned and the recipe needs 2.\n";
const draft = (header: string) => `---\n${header}\n---\n${BODY}`;

describe("parseDraft", () => {
  it("reads the title, the type, the areas and the body", () => {
    expect(parseDraft(draft("title: Eggs counted twice on the week plan\ntype: bug\nareas: [planning, groceries]"), { labels })).toEqual({
      title: "Eggs counted twice on the week plan",
      type: "bug",
      areas: ["planning", "groceries"],
      body: BODY,
    });
  });

  it("reads one area without brackets, quoted values, CRLF lines and a byte-order mark", () => {
    const text = `﻿---\r\ntitle: "Eggs: counted twice"\r\ntype: 'bug'\r\nareas: planning\r\n---\r\n${BODY}`;
    expect(parseDraft(text, { labels })).toMatchObject({ title: "Eggs: counted twice", type: "bug", areas: ["planning"] });
  });

  it("refuses a draft with no header, or a key it does not know", () => {
    expect(() => parseDraft(BODY, { labels })).toThrow(/no header/);
    expect(() => parseDraft(draft("title: Eggs\ntype: bug\nareas: [planning]\nlabels: [bug]"), { labels })).toThrow(/"labels"/);
  });

  it("refuses a draft with no title", () => {
    expect(() => parseDraft(draft("type: bug\nareas: [planning]"), { labels })).toThrow(/no title/);
  });

  it("refuses a draft with no type, or a type outside the four", () => {
    expect(() => parseDraft(draft("title: Eggs\nareas: [planning]"), { labels })).toThrow(/no type: one of bug, feature, chore, docs/);
    expect(() => parseDraft(draft("title: Eggs\ntype: planning\nareas: [planning]"), { labels })).toThrow(/type is "planning"/);
  });

  it("refuses a draft with no area, or an area that is not a label", () => {
    expect(() => parseDraft(draft("title: Eggs\ntype: bug\nareas: []"), { labels })).toThrow(/no area/);
    expect(() => parseDraft(draft("title: Eggs\ntype: bug"), { labels })).toThrow(/no area/);
    expect(() => parseDraft(draft("title: Eggs\ntype: bug\nareas: [planning, fridge]"), { labels })).toThrow(/"fridge" are not labels/);
  });
});

describe("issueArgs", () => {
  it("passes the title, the type and every area as labels, and reads the body from stdin", () => {
    expect(issueArgs({ title: "Eggs counted twice", type: "bug", areas: ["planning", "groceries"] })).toEqual([
      "issue",
      "create",
      "--title",
      "Eggs counted twice",
      "--body-file",
      "-",
      "--label",
      "bug",
      "--label",
      "planning",
      "--label",
      "groceries",
    ]);
  });
});

describe("ownerEnv", () => {
  it("drops the bot's token and config and every injected git config, and keeps the rest", () => {
    const env = {
      PATH: "/usr/bin",
      GH_TOKEN: "ghs_bot",
      GITHUB_TOKEN: "ghs_bot",
      GH_CONFIG_DIR: ".tmp/github/gh-config",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "credential.https://github.com.helper",
      GIT_CONFIG_VALUE_0: "!node scripts/github/git-credential.mjs",
      GIT_CONFIG_PARAMETERS: "'url.x.insteadOf'='y'",
    };
    expect(ownerEnv(env)).toEqual({ PATH: "/usr/bin" });
  });
});
