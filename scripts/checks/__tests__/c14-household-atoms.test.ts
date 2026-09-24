/**
 * C14's own tests.
 *
 * C14 cannot tell whether an atom is about a household; it only refuses to let the question go
 * unanswered. So what is pinned here is the sorting: a stateful atom nobody has classified fails,
 * a `householdAtom` or a listed one passes, atoms that hold nothing are not counted, and a list
 * entry whose atom has gone is reported rather than left to excuse whatever takes its name.
 */
import { afterEach, describe, expect, it } from "vitest";

import { NOT_HOUSEHOLD } from "../c14-household-atoms.not-household.mjs";
import { cleanupTrees, passed, runCheck, type Tree } from "./_harness";

/**
 * Every listed atom, declared where the list says it lives. Without them the real list is all stale
 * entries in a synthetic tree, and every case would fail on those instead of on what it arranged.
 */
const LISTED: Tree = Object.keys(NOT_HOUSEHOLD).reduce<Tree>((tree, key) => {
  const [file, name] = key.split(":") as [string, string];
  tree[file] = `${tree[file] ?? 'import { atom } from "jotai";\n'}export const ${name} = atom(0);\n`;
  return tree;
}, {});

const runC14 = (extra: Tree) => runCheck("c14-household-atoms.mjs", { ...LISTED, ...extra });

afterEach(cleanupTrees);

describe("a stateful atom must be sorted", () => {
  it("rejects a plain atom nobody has classified", () => {
    const result = runC14({
      "src/modules/cellar/_hooks/atoms.ts": 'import { atom } from "jotai";\nexport const shelfAtom = atom<string[]>([]);\n',
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain('"shelfAtom" holds session state');
    expect(result.output).toContain("src/modules/cellar/_hooks/atoms.ts:shelfAtom");
  });

  it("rejects a stateful jotai/utils constructor too", () => {
    const result = runC14({
      "src/modules/cellar/_hooks/atoms.ts":
        'import { atomWithStorage } from "jotai/utils";\nconst lastShelfAtom = atomWithStorage("shelf", "");\n',
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain('"lastShelfAtom" holds session state');
  });

  it("finds one in a .tsx file", () => {
    const result = runC14({
      "src/modules/cellar/sheet.tsx":
        'import { atom } from "jotai";\nconst openAtom = atom(false);\nexport const Sheet = () => <View />;\n',
    });

    expect(result.code).toBe(1);
    expect(result.output).toContain('"openAtom" holds session state');
  });

  it("accepts a householdAtom", () => {
    const result = runC14({
      "src/modules/cellar/_hooks/atoms.ts":
        'import { householdAtom } from "~/modules/households/household-atom";\nexport const shelfAtom = householdAtom<string[]>([]);\n',
    });

    expect(passed(result)).toBe(true);
  });
});

describe("what is not counted", () => {
  it("skips derived and write-only atoms, which hold nothing of their own", () => {
    const result = runC14({
      "src/modules/cellar/_hooks/atoms.ts":
        'import { atom } from "jotai";\n' +
        "export const countAtom = atom((get) => 0);\n" +
        "export const clearAtom = atom(null, (_get, set) => {});\n",
    });

    expect(passed(result)).toBe(true);
  });

  it("skips tests, and the file that defines householdAtom", () => {
    const result = runC14({
      "src/modules/cellar/_hooks/__tests__/atoms.test.ts": 'import { atom } from "jotai";\nconst fixtureAtom = atom(1);\n',
      "src/modules/households/household-atom.ts":
        'import { atomWithReset } from "jotai/utils";\nexport const householdAtom = (v) => { const scoped = atomWithReset(v); return scoped; };\n',
    });

    expect(passed(result)).toBe(true);
  });
});

describe("the list stays true", () => {
  it("passes the real list when every listed atom is where it says", () => {
    expect(passed(runC14({}))).toBe(true);
  });

  it("reports a listed atom that no longer exists", () => {
    const [firstKey] = Object.keys(NOT_HOUSEHOLD) as [string];
    const [file] = firstKey.split(":") as [string];
    const tree = { ...LISTED, [file]: 'import { atom } from "jotai";\n' };

    const result = runCheck("c14-household-atoms.mjs", tree);

    expect(result.code).toBe(1);
    expect(result.output).toContain(`NOT_HOUSEHOLD names "${firstKey}", which no longer declares an atom`);
  });

  it("passes this repository as it stands", () => {
    expect(passed(runCheck("c14-household-atoms.mjs", {}, process.cwd()))).toBe(true);
  });
});
