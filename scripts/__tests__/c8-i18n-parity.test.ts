/**
 * C8's own tests.
 *
 * i18next fails silently by design: ask for a key that is not there and it renders the key itself.
 * So a French plural missing its `many` form does not throw — it puts `items_many` on screen for
 * every count that selects it, and only for those counts, which is exactly the case nobody clicks
 * through in review. C8 is the only thing that sees it before a user does.
 *
 * `fr` needing `many` where `en` does not is the whole reason the check reads categories from
 * `Intl.PluralRules` per locale rather than comparing the two files key for key.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

const LOCALES = `export const DEFAULT_LOCALE = "en";
export const SUPPORTED_LOCALES = ["en", "fr"] as const;`;

/** Binds a namespace name to its file, which is where C8 reads the pairing from. */
const TYPES = `import home from "./en/home.json";
type TranslationResources = { Home: typeof home };`;

const json = (value: Record<string, unknown>) => JSON.stringify(value, null, 2);

const runC8 = (files: Record<string, string>) =>
  runCheck("c8-i18n-parity.mjs", { "shared/translations.ts": LOCALES, ...files });

/** The common case: one namespace, both locales, keys matching. */
const withNamespace = (en: Record<string, unknown>, fr: Record<string, unknown>, extra = {}) =>
  runC8({
    "translations/en/home.json": json(en),
    "translations/fr/home.json": json(fr),
    ...extra,
  });

afterEach(cleanupTrees);

describe("1 — locale directories match SUPPORTED_LOCALES", () => {
  it("rejects a declared locale with no directory", () => {
    const { code, output } = runC8({ "translations/en/home.json": json({ title: "Home" }) });

    expect(code).toBe(1);
    expect(output).toContain('SUPPORTED_LOCALES declares "fr", but translations/fr/ does not exist');
  });

  it("rejects a directory that is not declared", () => {
    const { code, output } = withNamespace({ title: "Home" }, { title: "Accueil" }, {
      "translations/de/home.json": json({ title: "Startseite" }),
    });

    expect(code).toBe(1);
    expect(output).toContain("translations/de/ is not listed in SUPPORTED_LOCALES");
  });

  it("accepts directories that match exactly", () => {
    const { code } = withNamespace({ title: "Home" }, { title: "Accueil" });

    expect(code).toBe(0);
  });
});

describe("2 — namespaces are the same in every locale", () => {
  it("rejects a namespace the reference locale has and another does not", () => {
    const { code, output } = withNamespace({ title: "Home" }, { title: "Accueil" }, {
      "translations/en/cellar.json": json({ title: "Cellar" }),
    });

    expect(code).toBe(1);
    expect(output).toContain('en/cellar.json has no counterpart in "fr"');
  });

  it("rejects a namespace only a non-reference locale has", () => {
    const { code, output } = withNamespace({ title: "Home" }, { title: "Accueil" }, {
      "translations/fr/cave.json": json({ title: "Cave" }),
    });

    expect(code).toBe(1);
    expect(output).toContain('"fr" carries namespace cave.json, which "en" does not');
  });
});

describe("3 and 4 — keys and their kinds", () => {
  it("rejects a key the reference defines and the other omits", () => {
    const { code, output } = withNamespace({ title: "Home", subtitle: "Hi" }, { title: "Accueil" });

    expect(code).toBe(1);
    expect(output).toContain('Missing key "subtitle", which "en" defines');
  });

  it("rejects a key present only in a non-reference locale", () => {
    const { code, output } = withNamespace({ title: "Home" }, { title: "Accueil", extra: "Bonus" });

    expect(code).toBe(1);
    expect(output).toContain('Key "extra" is absent from "en"');
  });

  it("rejects a key that is a string in one locale and an object in the other", () => {
    const { code, output } = withNamespace({ title: "Home" }, { title: { nested: "Accueil" } });

    expect(code).toBe(1);
    expect(output).toContain('Key "title"');
  });

  it("compares nested keys by their full path", () => {
    const { code } = withNamespace(
      { header: { title: "Home" } },
      { header: { title: "Accueil" } },
    );

    expect(code).toBe(0);
  });
});

describe("5 — plural families carry every category their locale needs", () => {
  it("rejects a French plural missing `many`, which English does not have", () => {
    // The case the whole check exists for: both files look complete side by side, and French
    // renders the raw key for every count that selects `many`.
    const { code, output } = withNamespace(
      { items_one: "{{count}} item", items_other: "{{count}} items" },
      { items_one: "{{count}} article", items_other: "{{count}} articles" },
    );

    expect(code).toBe(1);
    expect(output).toContain('Plural "items" is missing "_many"');
  });

  it("accepts a plural family complete in both locales", () => {
    const { code } = withNamespace(
      { items_one: "{{count}} item", items_other: "{{count}} items" },
      {
        items_one: "{{count}} article",
        items_many: "{{count}} d'articles",
        items_other: "{{count}} articles",
      },
    );

    expect(code).toBe(0);
  });

  it("rejects a category the locale has no rule for", () => {
    const { code, output } = withNamespace(
      { items_one: "one", items_other: "many", items_few: "few" },
      { items_one: "un", items_many: "beaucoup", items_other: "des" },
    );

    expect(code).toBe(1);
    expect(output).toContain('carries "_few"');
  });

  it("rejects a base that is both a plain key and a plural family", () => {
    const { code, output } = withNamespace(
      { items: "Items", items_one: "one", items_other: "many" },
      { items: "Articles", items_one: "un", items_many: "beaucoup", items_other: "des" },
    );

    expect(code).toBe(1);
    expect(output).toContain("is both a plain key and the base of a plural family");
  });
});

describe("6 — a plural call site passes a count", () => {
  const PLURAL_EN = { items_one: "{{count}} item", items_other: "{{count}} items" };
  const PLURAL_FR = {
    items_one: "{{count}} article",
    items_many: "{{count}} d'articles",
    items_other: "{{count}} articles",
  };

  it("rejects a call to a plural key with no count", () => {
    const { code, output } = withNamespace(PLURAL_EN, PLURAL_FR, {
      "translations/types.ts": TYPES,
      "src/screen.tsx": `const C = () => {
        const t = useTranslations("Home");
        return <Text>{t("items")}</Text>;
      };`,
    });

    expect(code).toBe(1);
    expect(output).toContain('"Home.items" is a plural, but this call passes no `count`');
  });

  it("accepts a call that passes a count", () => {
    const { code } = withNamespace(PLURAL_EN, PLURAL_FR, {
      "translations/types.ts": TYPES,
      "src/screen.tsx": `const C = () => {
        const t = useTranslations("Home");
        return <Text>{t("items", { count })}</Text>;
      };`,
    });

    expect(code).toBe(0);
  });

  it("leaves a non-plural key alone", () => {
    const { code } = withNamespace(
      { ...PLURAL_EN, title: "Home" },
      { ...PLURAL_FR, title: "Accueil" },
      {
        "translations/types.ts": TYPES,
        "src/screen.tsx": `const C = () => {
          const t = useTranslations("Home");
          return <Text>{t("title")}</Text>;
        };`,
      },
    );

    expect(code).toBe(0);
  });
});
