/**
 * C6's own tests.
 *
 * The predecessor's docs asserted a module with ten exported functions that had never been written,
 * four hooks that did not exist, and a screen convention used zero times. None of it was careless —
 * it was true when written, and nothing ever re-read it. An agent told to trust those docs writes
 * code against an API that is not there, which is the specific way documentation turns harmful.
 *
 * C6 is that re-read. It cannot prove prose is true; it proves the doc is not pointing at a ghost.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

const PACKAGE_JSON = JSON.stringify({ scripts: { verify: "…", "test:app": "…" } });

const runC6 = (files: Record<string, string>) =>
  runCheck("c6-doc-integrity.mjs", { "package.json": PACKAGE_JSON, ...files });

afterEach(cleanupTrees);

describe("1 — links resolve", () => {
  it("rejects a link to a file that does not exist", () => {
    const { code, output } = runC6({ "docs/guide.md": "See [the ADR](./adr/0001-gone.md)." });

    expect(code).toBe(1);
    expect(output).toContain("Link target does not exist: ./adr/0001-gone.md");
  });

  it("accepts a link to a file that does", () => {
    const { code } = runC6({
      "docs/guide.md": "See [the ADR](./adr/0001-real.md).",
      "docs/adr/0001-real.md": "# Real",
    });

    expect(code).toBe(0);
  });

  it("rejects an anchor that matches no heading in the same file", () => {
    const { code, output } = runC6({ "docs/guide.md": "# Title\n\nJump to [there](#missing)." });

    expect(code).toBe(1);
    expect(output).toContain('Anchor "#missing" does not match any heading');
  });

  it("accepts a same-file anchor that does match, including a multi-word heading", () => {
    const { code } = runC6({
      "docs/guide.md": "## Schema rules\n\nJump to [there](#schema-rules).",
    });

    expect(code).toBe(0);
  });

  it("rejects an anchor that is missing in the linked file", () => {
    const { code, output } = runC6({
      "docs/guide.md": "See [that](./other.md#nope).",
      "docs/other.md": "# Something else",
    });

    expect(code).toBe(1);
    expect(output).toContain("Link anchor does not exist: ./other.md#nope");
  });

  it("leaves external links alone", () => {
    const { code } = runC6({ "docs/guide.md": "[docs](https://docs.convex.dev/nope#anchor)" });

    expect(code).toBe(0);
  });
});

describe("2 — pnpm scripts exist", () => {
  it("rejects a doc telling you to run a script that is not in package.json", () => {
    const { code, output } = runC6({ "docs/guide.md": "Run `pnpm check:everything` first." });

    expect(code).toBe(1);
    expect(output).toContain('Doc tells you to run "pnpm check:everything"');
  });

  it("accepts a script that is in package.json", () => {
    const { code } = runC6({ "docs/guide.md": "Run `pnpm verify` and `pnpm test:app`." });

    expect(code).toBe(0);
  });

  it("accepts pnpm's own commands, which are not repo scripts", () => {
    const { code } = runC6({ "docs/guide.md": "Run `pnpm install`, then `pnpm dlx expo`." });

    expect(code).toBe(0);
  });
});

describe("3 — backticked repo paths exist", () => {
  it("rejects a path that does not exist", () => {
    const { code, output } = runC6({ "docs/guide.md": "Edit `src/modules/ghost/hooks.ts`." });

    expect(code).toBe(1);
    expect(output).toContain("Doc references `src/modules/ghost/hooks.ts`, which does not exist");
  });

  it("accepts a path that does", () => {
    const { code } = runC6({
      "docs/guide.md": "Edit `src/modules/real/hooks.ts`.",
      "src/modules/real/hooks.ts": "export const x = 1;",
    });

    expect(code).toBe(0);
  });

  it("leaves a glob or a directory alone — those are contracts, not claims", () => {
    const { code } = runC6({
      "docs/guide.md": "Files live in `src/modules/*/hooks.ts` and under `convex/router/`.",
    });

    expect(code).toBe(0);
  });
});

describe("exemptions", () => {
  it("does not check commands or paths inside docs/_reference/, which describes another repo", () => {
    const { code } = runC6({
      "docs/_reference/04-BLUEPRINT.md": "Run `pnpm nonexistent`; see `src/gone/file.ts`.",
    });

    expect(code).toBe(0);
  });

  it("still checks links inside docs/_reference/, which do point at this repo", () => {
    const { code, output } = runC6({
      "docs/_reference/04-BLUEPRINT.md": "See [that](./missing.md).",
    });

    expect(code).toBe(1);
    expect(output).toContain("Link target does not exist");
  });
});

describe("4 — PLANNED only ever shrinks", () => {
  it("fails once a planned path exists, so the exemption cannot outlive its reason", () => {
    // This is what stops PLANNED becoming a permanent allowlist: the moment the file lands, C6
    // fails until the entry is deleted.
    const { code, output } = runC6({ "src/global/routes.ts": "export const ROUTES = {};" });

    expect(code).toBe(1);
    expect(output).toContain('"src/global/routes.ts" now exists but is still listed as PLANNED');
  });
});
