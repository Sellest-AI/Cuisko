/**
 * The memory never holds personal data, the owner's included (spec §11.1). `mask` runs on every
 * transcript before a model reads it; `scan` runs on the memory files before each diff and each
 * commit. A miss here is a name or a key kept in git forever, even encrypted. A false hit is a
 * memory file that can never be committed, or a transcript the dreamers cannot read.
 *
 * The identity is fixed and invented, so the machine running the test never changes the answer.
 */
import os from "node:os";
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/pii.mjs";

/** `pii.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
type Identity = { userName?: string; home?: string; gitName?: string; gitEmail?: string };
type Hit = { kind: "email" | "phone" | "secret" | "owner"; match: string; line: number };
const { mask, ownerIdentity, scan } = lib as unknown as {
  mask: (text: string, identity: Identity) => string;
  ownerIdentity: (cwd?: string) => Identity;
  scan: (text: string, identity: Identity) => Hit[];
};

const OWNER: Identity = {
  userName: "jdoe",
  home: String.raw`C:\Users\jdoe`,
  gitName: "Jeanne Dœuf-Müller",
  gitEmail: "jeanne.doeuf@perso.fr",
};
const NOBODY: Identity = {};

const kinds = (text: string, identity = OWNER) => scan(text, identity).map((hit) => hit.kind);

describe("shapes", () => {
  it.each([
    ["an email", "write to alice.martin+test@mail.example.org today", "email", "write to [email masked] today"],
    ["a French phone with spaces", "call 06 12 34 56 78", "phone", "call [phone masked]"],
    ["a French phone in one run", "call 0612345678.", "phone", "call [phone masked]."],
    ["a French phone with dots", "call 06.12.34.56.78", "phone", "call [phone masked]"],
    ["an international phone", "call +33 6 12 34 56 78", "phone", "call [phone masked]"],
    ["a US phone", "call +1 415 555 2671", "phone", "call [phone masked]"],
    ["an Anthropic key", "key sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv", "secret", "key [secret masked]"],
    ["a GitHub token", `token ghp_${"a1B2".repeat(9)}`, "secret", "token [secret masked]"],
    ["an AWS key id", "id AKIAIOSFODNN7EXAMPLE", "secret", "id [secret masked]"],
  ])("finds and masks %s", (_name, text, kind, masked) => {
    expect(kinds(text, NOBODY)).toEqual([kind]);
    expect(mask(text, NOBODY)).toBe(masked);
  });

  it("keeps the name of an env assignment and masks its value", () => {
    expect(mask("MEMORY_KEY=Zx81kq0pLm42vBn7Tr3s", NOBODY)).toBe("MEMORY_KEY=[secret masked]");
  });

  it.each([
    ["a date", "on 2026-11-08 at 09:00"],
    ["an ISO timestamp", "2026-11-08T09:00:00.000Z"],
    ["a version string", "convex 1.44.0, release v0.8.0"],
    ["a Convex id", "recipe jd7a8b0612345678kx9m2n4p6q8r0s2t"],
    ["a commit hash", "commit 91a282e0612345678abcdef0123456789abcdef0"],
    ["a millisecond timestamp", "at 1731024000000"],
    ["a count", "4501 tests, 42 new"],
  ])("does not flag %s", (_name, text) => {
    expect(scan(text, OWNER)).toEqual([]);
    expect(mask(text, OWNER)).toBe(text);
  });
});

describe("the owner's identity", () => {
  it.each([
    ["a Windows path", String.raw`C:\Users\jdoe\Documents\cuisko\src\x.ts`, String.raw`~/Documents\cuisko\src\x.ts`],
    ["an escaped Windows path", String.raw`"C:\\Users\\jdoe\\Documents"`, String.raw`"~/Documents"`],
    ["a lowercase forward-slash path", "c:/users/jdoe/documents", "~/documents"],
    ["a Git Bash path", "/c/Users/jdoe/Documents", "~/Documents"],
    ["the home alone", String.raw`cd C:\Users\jdoe`, "cd ~"],
  ])("masks the home in %s", (_name, text, masked) => {
    expect(mask(text, OWNER)).toBe(masked);
    expect(kinds(text)).toEqual(["owner"]);
  });

  it("masks the user name in a Claude project folder name", () => {
    expect(mask("projects/C--Users-jdoe-Documents-cuisko/x.jsonl", OWNER)).toBe(
      "projects/C--Users-[owner]-Documents-cuisko/x.jsonl",
    );
  });

  it("masks the git name and email as free text, without case", () => {
    expect(mask("Author: JEANNE DŒUF-MÜLLER <Jeanne.Doeuf@perso.fr>", OWNER)).toBe("Author: [owner] <[owner]>");
    expect(kinds("jeanne dœuf-müller")).toEqual(["owner"]);
  });

  it("matches a name written with decomposed accents", () => {
    const decomposed = "Jeanne Dœuf-Mu\u0308ller";
    expect(mask(decomposed, OWNER)).toBe("[owner]");
  });

  it("matches the user name only inside a path", () => {
    const dev: Identity = { userName: "dev" };
    expect(mask("commit on dev, then merge dev into main", dev)).toBe("commit on dev, then merge dev into main");
    expect(mask("/home/dev/cuisko and C:\\Users\\dev\\x", dev)).toBe("/home/[owner]/cuisko and C:\\Users\\[owner]\\x");
  });

  it("masks nothing of the owner's when the git name is unset", () => {
    expect(scan("Jeanne wrote the planner", { ...OWNER, gitName: undefined })).toEqual([]);
  });

  it("with an empty identity, flags no word and still finds the shapes", () => {
    const text = "commit on dev\nmail bob@site.io\ncall 06 12 34 56 78\nkey sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv";
    expect(scan(text, NOBODY)).toEqual([
      { kind: "email", match: "bob@site.io", line: 2 },
      { kind: "phone", match: "06 12 34 56 78", line: 3 },
      { kind: "secret", match: "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv", line: 4 },
    ]);
  });
});

describe("mask and scan together", () => {
  const dirty = [
    String.raw`Read C:\Users\jdoe\Documents\cuisko\.env.local`,
    "git log says Jeanne Dœuf-Müller <jeanne.doeuf@perso.fr>",
    "the tester is bob@site.io, 06 12 34 56 78",
    "CONVEX_DEPLOY_KEY=prod:happy-otter-123|eyJ2MjoiYWJjZGVmZ2hpams",
  ].join("\n");

  it("reports one hit per value, with its line", () => {
    expect(scan(dirty, OWNER).map(({ kind, line }) => `${line}:${kind}`)).toEqual([
      "1:owner",
      "2:owner",
      "2:owner",
      "3:email",
      "3:phone",
      "4:secret",
    ]);
  });

  it("leaves a text that scans clean", () => {
    expect(scan(mask(dirty, OWNER), OWNER)).toEqual([]);
  });
});

describe("ownerIdentity", () => {
  it("never throws outside a repository, and drops nothing but short or missing values", () => {
    const identity = ownerIdentity(os.tmpdir());
    for (const value of Object.values(identity)) expect(value?.length).toBeGreaterThanOrEqual(3);
  });
});
