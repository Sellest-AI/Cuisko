/**
 * The reader of a memory folder (spec §4.2, P5). C20 and memory:update both build on what it
 * returns, so a title read wrong lands in the index, and a fact line read wrong hides a bullet
 * with no source date.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import * as lib from "../_lib/memoryFiles.mjs";

type MemoryFile = {
  path: string;
  title: string | null;
  summary: string | null;
  status: string | null;
  lastVerified: string | null;
  body: string;
  headerLines: number;
  errors: string[];
};
const { citedDocs, factBullets, fileLinks, isEncrypted, readMemoryFiles } = lib as unknown as {
  citedDocs: (text: string) => string[];
  factBullets: (body: string, offset?: number) => { text: string; line: number }[];
  fileLinks: (text: string) => string[];
  isEncrypted: (text: string) => boolean;
  readMemoryFiles: (dir: string) => { files: MemoryFile[]; strays: string[] };
};

const dirs: string[] = [];
const folderWith = (files: Record<string, string>) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cuisko-memfiles-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  return dir;
};
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const HEADER = "---\nsummary: Dates are timestamps.\nstatus: volatile\nlast_verified: 2026-11-08\n---\n";

describe("readMemoryFiles", () => {
  it("reads the title and the summary the index prints", () => {
    const { files } = readMemoryFiles(folderWith({ "memories/dates.md": `${HEADER}\n# Convex dates\n` }));

    expect(files).toMatchObject([{ path: "memories/dates.md", title: "Convex dates", summary: "Dates are timestamps.", status: "volatile", lastVerified: "2026-11-08", errors: [] }]);
  });

  it("returns the files in path order, and no files for a missing folder", () => {
    const dir = folderWith({ "memories/b.md": `${HEADER}# B\n`, "memories/a.md": `${HEADER}# A\n` });

    expect(readMemoryFiles(dir).files.map((file) => file.path)).toEqual(["memories/a.md", "memories/b.md"]);
    expect(readMemoryFiles(path.join(dir, "absent"))).toEqual({ files: [], strays: [] });
  });

  it("names a header line that is not key: value, and an unknown key", () => {
    const broken = readMemoryFiles(folderWith({ "memories/a.md": "---\nsummary Dates\n---\n# A\n", "memories/b.md": `${HEADER.replace("---\n", "---\nowner: me\n")}# B\n` }));

    expect(broken.files[0]?.errors[0]).toContain('not "key: value"');
    expect(broken.files[1]?.errors.join()).toContain("header");
    expect(broken.files[1]?.summary).toBeNull();
  });

  it("lists what is not a .md file as a stray", () => {
    const { strays } = readMemoryFiles(folderWith({ "memories/a.md": `${HEADER}# A\n`, "memories/x.txt": "x", "memories/sub/b.md": "x" }));

    expect(strays).toEqual(["memories/sub", "memories/x.txt"]);
  });
});

describe("factBullets", () => {
  const body = "# T\n\n## Facts\n\n- One. (source: 2026-11-02)\n- Two\n  wraps. (source: 2026-11-03)\n\n## Links\n\n- [A](a.md)\n";

  it("returns the bullets of the Facts section only, wrapped lines joined", () => {
    expect(factBullets(body).map((bullet) => bullet.text)).toEqual(["One. (source: 2026-11-02)", "Two wraps. (source: 2026-11-03)"]);
  });

  it("gives the line in the file, header included", () => {
    expect(factBullets(body, 5).map((bullet) => bullet.line)).toEqual([10, 11]);
  });
});

describe("fileLinks and citedDocs", () => {
  it("keeps links to files, drops web links and anchors, strips a fragment", () => {
    expect(fileLinks("[a](a.md) [b](https://x.io) [c](#top) [d](d.md#part) [e](mailto:a@b.co)")).toEqual(["a.md", "d.md"]);
  });

  it("ignores an example link written as code, inline or fenced, and still finds a real one beside it", () => {
    const text = "An example is `[x](path.md)`.\n\n```md\n[y](other.md)\n```\n\nSee [real](real.md).";
    expect(fileLinks(text)).toEqual(["real.md"]);
  });

  it("finds docs/ paths in backticks only, without trailing punctuation or globs", () => {
    expect(citedDocs("See `docs/A.md`, and `docs/adr/*.md`, and docs/B.md, and `src/x.ts`.")).toEqual(["docs/A.md"]);
    expect(citedDocs("`docs/A.md.`")).toEqual(["docs/A.md"]);
  });
});

describe("isEncrypted", () => {
  it("recognises the transcrypt header and nothing else", () => {
    expect(isEncrypted("U2FsdGVkX1+abc")).toBe(true);
    expect(isEncrypted("# Cuisko project memory")).toBe(false);
  });
});
