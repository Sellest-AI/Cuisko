/**
 * C12's own tests.
 *
 * A check script fails OPEN. If `valuesOf` stopped following the spread in `TAGS`, or the
 * namespace lookup came back empty, C12 would print ✅ over every locale forever and the promise
 * it exists to keep — an entry added to a shared vocabulary does not ship without its words —
 * would quietly stop being kept, with nothing about the repo going green looking any different.
 *
 * So what is pinned here is not "C12 passes on our translations", it is that it still fails on
 * each shape it exists to reject, and above all that it still governs anything at all.
 */
import { afterEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { cleanupTrees, passed, runCheck, type Tree } from "./_harness";

afterEach(cleanupTrees);

const SCRIPT = "c12-vocabulary-coverage.mjs";

const TYPES = `
  import equipments from "./en/vocabulary.json";
  import home from "./en/home.json";

  type TranslationResources = {
    Home: typeof home;
    Vocabulary: typeof equipments;
  };
`;

/**
 * `TAGS` is spelled as the spread it really is. A fixture that flattened it by hand would pass
 * against a `valuesOf` that gave up on spreads and read the vocabulary as empty — the exact
 * regression these tests exist to catch.
 */
const SHARED: Tree = {
  "shared/translations.ts": `
    export const DEFAULT_LOCALE = "en";
    export const SUPPORTED_LOCALES = ["en", "fr"] as const;
  `,
  "shared/equipments.ts": `export const EQUIPMENTS = ["oven"] as const;`,
  "shared/tags.ts": `
    export const COMPUTED_TAGS = ["vegan"] as const;
    export const AUTHORED_TAGS = ["quick"] as const;
    export const TAGS = [...COMPUTED_TAGS, ...AUTHORED_TAGS] as const;
  `,
  "shared/diets.ts": `export const DIETS = ["vegan", "omnivore"] as const;`,
  "shared/allergens.ts": `export const ALLERGENS = ["gluten"] as const;`,
  "shared/cuisines.ts": `export const CUISINES = ["french"] as const;`,
  "shared/categories.ts": `export const CATEGORIES = ["VEGETABLE"] as const;`,
  /**
   * Spelled with a second export beside it, because `UNITS` is the one registered vocabulary whose
   * source file is not single-purpose — it sits in `shared/ingredients.ts` among the conversions.
   * A fixture holding the constant alone would pass against a `declaredConstants` that only ever
   * read the first declaration in a file.
   */
  "shared/ingredients.ts": `
    export const NO_EMOJI = "-";
    export const UNITS = ["g", "tbsp"] as const;
    export const unitLabel = (unit: string) => unit;
  `,
  "translations/types.ts": TYPES,
};

const COMPLETE = {
  Equipments: { oven: "Oven" },
  Tags: { vegan: "Vegan", quick: "Quick" },
  Diets: { vegan: "Vegan", omnivore: "Omnivore" },
  Allergens: { gluten: "Gluten" },
  Cuisines: { french: "French" },
  Categories: { VEGETABLE: "Vegetable" },
  Units: { g: "g", tbsp: "cs" },
};

/** The fixture, with `edit` applied to the French words only — so the two locales disagree. */
const runC12 = (edit: (words: typeof COMPLETE) => unknown = (words) => words, tree: Tree = {}) =>
  runCheck(SCRIPT, {
    ...SHARED,
    "translations/en/vocabulary.json": JSON.stringify(COMPLETE),
    "translations/fr/vocabulary.json": JSON.stringify(
      edit(JSON.parse(JSON.stringify(COMPLETE)) as typeof COMPLETE),
    ),
    ...tree,
  });

describe("a fully translated vocabulary", () => {
  it("passes", () => {
    expect(passed(runC12())).toBe(true);
  });

  /**
   * The check has to hold on the tree it actually guards, not only on fixtures — a rule that
   * passes in the lab and fails in the repo is one somebody disables on a Friday.
   */
  it("passes on this repo as it stands", () => {
    // Three levels: __tests__/ -> checks/ -> scripts/ -> the repo. Aimed one level short, the
    // check runs against a tree with no shared/ or translations/ and reports nothing to find.
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    expect(passed(runCheck(SCRIPT, { ".keep": "" }, root))).toBe(true);
  });
});

describe("an entry with no word", () => {
  it("rejects a key missing from one locale", () => {
    const { code, output } = runC12((words) => {
      delete (words.Allergens as Record<string, string>).gluten;
      return words;
    });

    expect(code).toBe(1);
    expect(output).toContain("Allergens.gluten");
    expect(output).toContain("translations/fr/vocabulary.json");
  });

  /** A blank renders as a chip with nothing on it, which is the failure, not a near miss. */
  it.each([
    ["empty", ""],
    ["whitespace-only", "   "],
  ])("rejects an %s value", (_label, word) => {
    const { code, output } = runC12((words) => {
      words.Diets.omnivore = word;
      return words;
    });

    expect(code).toBe(1);
    expect(output).toContain("Diets.omnivore");
  });

  /**
   * Reached only through the spread in `TAGS`. If `valuesOf` stops following it the vocabulary
   * reads as empty and this passes — which is why the assertion is on a spread entry rather than
   * on a plain one.
   */
  it("rejects a tag reachable only through a spread", () => {
    const { code, output } = runC12((words) => {
      delete (words.Tags as Record<string, string>).quick;
      return words;
    });

    expect(code).toBe(1);
    expect(output).toContain("Tags.quick");
  });

  it("rejects a whole block that is missing", () => {
    const { code, output } = runC12((words) => {
      delete (words as Partial<typeof COMPLETE>).Equipments;
      return words;
    });

    expect(code).toBe(1);
    expect(output).toContain('no "Equipments" object');
  });
});

describe("copy that outlived its entry", () => {
  it("rejects a key that is not in the vocabulary", () => {
    const { code, output } = runC12((words) => {
      (words.Equipments as Record<string, string>).sousvide = "Sous vide";
      return words;
    });

    expect(code).toBe(1);
    expect(output).toContain("Equipments.sousvide");
    expect(output).toContain("not in the vocabulary");
  });
});

/**
 * Assertions 2–4 iterate the REGISTERED vocabularies, so a block nobody registered is checked by
 * nobody and looks exactly like one that passes. This check shipped covering four of six shared
 * vocabularies for precisely that reason, and nothing said so — which is why the guard has a test
 * of its own rather than being trusted to the docstring that used to claim it.
 */
describe("a block no row claims", () => {
  it("rejects it rather than silently checking nothing", () => {
    const { code, output } = runC12((words) => ({ ...words, Sauces: { aioli: "Aioli" } }));

    expect(code).toBe(1);
    expect(output).toContain("Sauces");
    expect(output).toContain("not claimed by any row");
  });
});

describe("the things it cannot read", () => {
  it("rejects a vocabulary it cannot parse rather than skipping it", () => {
    const { code, output } = runC12(undefined, {
      "shared/allergens.ts": `
        const REGULATED = ["gluten"];
        export const ALLERGENS = [...REGULATED, ...somethingDynamic()] as const;
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("Could not read ALLERGENS");
  });

  it("rejects a missing shared vocabulary file", () => {
    const tree = { ...SHARED };
    delete tree["shared/diets.ts"];

    const { code, output } = runCheck(SCRIPT, {
      ...tree,
      "translations/en/vocabulary.json": JSON.stringify(COMPLETE),
      "translations/fr/vocabulary.json": JSON.stringify(COMPLETE),
    });

    expect(code).toBe(1);
    expect(output).toContain("shared/diets.ts");
  });

  it("rejects a namespace nobody registered", () => {
    const { code, output } = runC12(undefined, {
      "translations/types.ts": `
        import home from "./en/home.json";
        type TranslationResources = { Home: typeof home };
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("No Vocabulary namespace is registered");
  });

  it("rejects a locale file that is missing entirely", () => {
    const { code, output } = runCheck(SCRIPT, {
      ...SHARED,
      "translations/en/vocabulary.json": JSON.stringify(COMPLETE),
    });

    expect(code).toBe(1);
    expect(output).toContain("translations/fr/vocabulary.json");
  });
});
