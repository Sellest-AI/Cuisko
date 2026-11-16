/**
 * The PR's Memory section is how the owner reads what the dream learned. The facts sit in git as
 * ciphertext, so a summary read from the raw blobs would list gibberish. Each case uses a throwaway
 * repo whose `crypt` filter really changes the bytes (rot13), as transcrypt does.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/memorySummary.mjs";

/** `memorySummary.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { memorySummary } = lib as unknown as { memorySummary: (options: { top: string; base: string; head: string }) => string };

const ROT13 = "tr 'A-Za-z' 'N-ZA-Mn-za-m'";

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8" }).trim();

const write = (repo: string, file: string, text: string) => {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), text);
};

const fact = (title: string) => `---\ntitle: ${title}\nstatus: stable\ncreated: 2026-11-01\nlast_verified: 2026-11-01\n---\n${title}. (source: 2026-11-01)\n`;

const EGGS = ".claude/memory/memories/planning/eggs-counted-once-a1b2.md";
const ISO = ".claude/memory/memories/convex-api/convex-refuses-iso-dates-k3x9.md";

/** A repo on `dev` with two facts, behind a filter that rot13s them in the blobs. */
const makeRepo = () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "memory-summary-"));
  created.push(repo);
  git(repo, "init", "-q", "-b", "dev");
  git(repo, "config", "filter.crypt.clean", ROT13);
  git(repo, "config", "filter.crypt.smudge", ROT13);
  git(repo, "config", "filter.crypt.required", "true");
  write(repo, ".gitattributes", ".claude/memory/memories/** filter=crypt\n");
  write(repo, EGGS, fact("Eggs are counted once per meal"));
  write(repo, ISO, fact("Convex refuses ISO dates"));
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "--no-verify", "-m", "init");
  git(repo, "checkout", "-q", "-b", "fix/12-eggs");
  return repo;
};

describe("memorySummary", () => {
  it("lists the facts added, changed and dropped under their topic, read in clear", () => {
    const repo = makeRepo();
    expect(git(repo, "cat-file", "-p", `HEAD:${EGGS}`)).toContain("Rttf ner pbhagrq");

    write(repo, EGGS, fact("Eggs are counted once per week"));
    write(repo, ".claude/memory/memories/planning/leftovers-count-as-owned-z9y8.md", fact("Leftovers count as owned food"));
    git(repo, "rm", "-q", ISO);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "--no-verify", "-m", "chore(memory): update");

    expect(memorySummary({ top: repo, base: "dev", head: "HEAD" })).toBe(
      [
        "**convex-api**",
        "- dropped: Convex refuses ISO dates",
        "",
        "**planning**",
        "- added: Leftovers count as owned food",
        "- changed: Eggs are counted once per week",
      ].join("\n"),
    );
  });

  it('says "No fact changed." when only a usage file changed', () => {
    const repo = makeRepo();
    write(repo, ".claude/memory/usage/2026-11-12-u1u1.json", "{}\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "--no-verify", "-m", "chore(memory): no fact");

    expect(memorySummary({ top: repo, base: "dev", head: "HEAD" })).toBe("No fact changed.");
  });
});
