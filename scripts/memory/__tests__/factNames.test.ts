/**
 * The name of a new fact. Only the script names facts, so a name that breaks the rule, or one
 * already taken, would reach the memory from here alone.
 */
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/factNames.mjs";
import * as files from "../_lib/memoryFiles.mjs";

const { factName } = lib as unknown as { factName: (title: string, options: { taken: Set<string> }) => string };
const { isFactName } = files as unknown as { isFactName: (name: string) => boolean };

/** The slug part of a new name: what comes before "-<id>.md". */
const slugOf = (title: string) => factName(title, { taken: new Set() }).replace(/-[a-z0-9]{4}[.]md$/, "");

describe("the slug of a new name", () => {
  it("lowercases the title and joins its words with -", () => {
    expect(slugOf("Stand-in hook needs mode 755")).toBe("stand-in-hook-needs-mode-755");
  });

  it("drops accents and punctuation", () => {
    expect(slugOf("Crème brûlée: l'œuf, d'abord!")).toBe("creme-brulee-l-uf-d-abord");
  });

  it("cuts at a word to stay within 50 characters", () => {
    const slug = slugOf("Node missing from PATH in bash started from PowerShell gives an empty trace id");
    expect(slug.length).toBeLessThanOrEqual(50);
    expect(slug).toBe("node-missing-from-path-in-bash-started-from");
  });

  it("cuts a single word longer than the limit, and names an empty title fact", () => {
    expect(slugOf("a".repeat(60))).toBe("a".repeat(50));
    expect(slugOf("!!!")).toBe("fact");
  });
});

describe("factName", () => {
  it("gives a legal name built on the title's slug", () => {
    const name = factName("Stand-in hook needs mode 755", { taken: new Set() });
    expect(name).toMatch(/^stand-in-hook-needs-mode-755-[a-z0-9]{4}\.md$/);
    expect(isFactName(name)).toBe(true);
  });

  it("never returns a taken name", () => {
    const taken = new Set<string>();
    for (let call = 0; call < 200; call++) {
      const name = factName("Same title", { taken });
      expect(taken.has(name)).toBe(false);
      taken.add(name);
    }
  });
});
