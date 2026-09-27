import { describe, expect, test } from "vitest";

import { hashText } from "@convex/lib/i18n";
import { LOCALES } from "@convex/schema/i18n";
import { computeNutriScore } from "@shared/nutrition";
import { searchTextOf } from "@shared/search";

import { CATALOG } from "../ingredientCatalog";
import { ingredientRow, restoredIngredientRow } from "../ingredientRow";

/** The catalog's flat `en`/`fr` pair in the locale-keyed shape the sanitizer takes. */
const factsOf = (entry: (typeof CATALOG)[number]) => {
  const { en, fr, ...facts } = entry;

  return {
    ...facts,
    diet: entry.diet!,
    names: {
      en: { value: en, status: "edited" as const },
      fr: { value: fr, status: "edited" as const },
    },
  };
};

/**
 * The ADR 0011 guard.
 *
 * `ingredients` has several legitimate writers — the seed here, the cook's path next — and the
 * invariant is not that there is one writer but that none of them shapes its own row. These
 * assertions are the observable form of that: every derived field on every one of the catalog's
 * rows comes out of the shared serializers and out of nothing else.
 *
 * Run across the whole `CATALOG` rather than a fixture on purpose. A derived field that is wrong
 * for one row in 266 has no symptom — the row is simply never found by search again — so the only
 * useful sample size is all of them.
 */
describe("functions/ingredients/ingredientRow", () => {
  const entries = CATALOG.filter((entry) => entry.diet).map((entry) => ({
    entry,
    row: ingredientRow(factsOf(entry), "seed"),
  }));

  test("the catalog is large enough for this file to mean anything", () => {
    expect(entries.length).toBeGreaterThan(200);
  });

  test("`search` is what the shared serializer produces, for every row and both locales", () => {
    for (const { entry, row } of entries) {
      expect(row.search).toEqual({
        en: searchTextOf([entry.en, ...(entry.aliases.en ?? [])]),
        fr: searchTextOf([entry.fr, ...(entry.aliases.fr ?? [])]),
      });
    }
  });

  test("every row carries a grade, and the catalog never supplies one itself", () => {
    for (const { entry, row } of entries) {
      expect(row.nutriScore?.grade).toMatch(/^[A-E]$/);
      expect(entry).not.toHaveProperty("nutriScore");
    }
  });

  test("both locales are written into `name`, with the source hash that tracks an edit", () => {
    for (const { entry, row } of entries) {
      expect(row.name.values).toEqual({ en: entry.en, fr: entry.fr });
      expect(row.name.meta.en?.status).toBe("edited");
      expect(row.name.meta.fr?.status).toBe("edited");
    }
  });

  test("facts pass through untouched — the sanitizer derives, it does not decide", () => {
    for (const { entry, row } of entries) {
      expect(row.category).toBe(entry.category);
      expect(row.diet).toBe(entry.diet);
      expect(row.allergens).toEqual(entry.allergens);
      expect(row.nutrition).toEqual(entry.nutrition);
      expect(row.defaultUnit).toBe(entry.defaultUnit);
      expect(row.defaultQuantity).toBe(entry.defaultQuantity);
      expect(row.emoji).toBe(entry.emoji);
      expect(row.slug).toBe(entry.slug);
    }
  });

  test("both shelf lives reach the row, which is where `addToCellar` reads the date from", () => {
    for (const { entry, row } of entries) {
      expect(row.shelfLifeDays).toBe(entry.shelfLifeDays);
      expect(row.openedShelfLifeDays).toBe(entry.openedShelfLifeDays);
    }

    const milk = entries.find(({ entry }) => entry.slug === "milk-whole")!.row;
    expect(milk).toMatchObject({ shelfLifeDays: 90, openedShelfLifeDays: 3 });
  });

  /**
   * Nutrition counts only the share of a row that is eaten, so a share that stopped here would put
   * the shells back into every total. An absent one must still be WRITTEN, as `undefined`: that is
   * how the seed's `patch` clears a share the catalog no longer states, where an omitted key would
   * leave the old one counting.
   */
  test("the edible share reaches the row, and an absent one is written so a patch clears it", () => {
    const mussels = factsOf(CATALOG.find((entry) => entry.slug === "mussels")!);

    expect(ingredientRow({ ...mussels, edibleShare: 0.4 }, "seed").edibleShare).toBe(0.4);

    const cleared = ingredientRow({ ...mussels, edibleShare: undefined }, "seed");
    expect("edibleShare" in cleared).toBe(true);
    expect(cleared.edibleShare).toBeUndefined();
  });

  /**
   * `source` is an argument and not a fact: the same carrot recorded by the seed and by a lookup
   * is the same carrot, provenanced differently. Nothing else about the row may move with it —
   * a name's status included, which travels with the name rather than with the writer.
   */
  test("only `source` changes when the same facts are recorded by a different writer", () => {
    const facts = factsOf(CATALOG[0]!);

    const seeded = ingredientRow(facts, "seed");
    const measured = ingredientRow(facts, "foodComposition");

    expect(seeded.source).toBe("seed");
    expect(measured.source).toBe("foodComposition");
    expect({ ...seeded, source: null }).toEqual({ ...measured, source: null });
  });

  /**
   * The case the locale-keyed shape exists for, and the one an `en`/`fr` pair could not express:
   * a row whose French name CIQUAL authored and whose English name a model rendered from it. The
   * two must not be marked alike — `"edited"` forbids replacing a name later, so claiming it for
   * the rendered half would make an invented spelling permanent.
   */
  test("each language keeps the status its own writer gave it", () => {
    const row = ingredientRow(
      {
        ...factsOf(CATALOG[0]!),
        names: {
          fr: { value: "Carotte", status: "edited" },
          en: { value: "Carrot", status: "machine" },
        },
      },
      "agent",
    );

    expect(row.name.meta.fr?.status).toBe("edited");
    expect(row.name.meta.en?.status).toBe("machine");
    expect(row.name.values).toEqual({ fr: "Carotte", en: "Carrot" });
  });

  /**
   * A row named in one language only is invisible to the other language's shopper, who then gets
   * a duplicate created for them — the failure the whole resolver exists to prevent. 2216 of the
   * shipped taxonomy's entries know a food in one language only, so this is the common case and
   * not the corner: every locale is indexed, or the row does not get built.
   */
  test("every locale is indexed, so neither language's shopper can miss the row", () => {
    for (const { row } of entries) {
      for (const locale of LOCALES) {
        expect(row.search?.[locale]).toBeTruthy();
        expect(row.name.values[locale]).toBeTruthy();
      }
    }
  });

  /**
   * `sourceHash` records the text a name was RENDERED FROM, so a later run can notice that text
   * changed underneath it. Hashing each name against itself — which this file used to do — is the
   * one shape `isTranslationOutdated` can never fire on: it compares a value to itself, so an
   * ingredient re-translation pass would report every row up to date forever, with no symptom.
   *
   * The pivot is the language the shopper typed in, because that is the one the agent rendered the
   * others from. A shopper typing `chocolat lindt` gets both names from the model — neither is
   * `edited` — so nothing but this pivot records which way the derivation ran.
   */
  test("a rendered name is hashed against the language it was rendered from", () => {
    const row = ingredientRow(
      {
        ...factsOf(CATALOG[0]!),
        sourceLocale: "fr",
        names: {
          fr: { value: "chocolat lindt", status: "machine" },
          en: { value: "lindt chocolate bar", status: "machine" },
        },
      },
      "agent",
    );

    expect(row.name.meta.en?.sourceHash).toBe(hashText("chocolat lindt"));
    expect(row.name.meta.fr?.sourceHash).toBe(hashText("chocolat lindt"));
  });

  /** Without a pivot — the seed's case — `en` is the fallback, and every locale still agrees. */
  test("the pivot falls back to English when the writer has no locale to give", () => {
    const row = ingredientRow(
      {
        ...factsOf(CATALOG[0]!),
        names: {
          fr: { value: "chocolat lindt", status: "machine" },
          en: { value: "lindt chocolate bar", status: "machine" },
        },
      },
      "agent",
    );

    expect(row.name.meta.fr?.sourceHash).toBe(hashText("lindt chocolate bar"));
    expect(row.name.meta.en?.sourceHash).toBe(hashText("lindt chocolate bar"));
  });

  /**
   * Hand-written text was derived from nothing, so it is hashed against itself — the same shape
   * `isTranslationOutdated` documents for `edited`. This is what leaves `seedIngredients`, whose
   * catalog names are `edited` in both languages, byte-identical to what it wrote before the pivot
   * existed: a rule that changed the seed's rows would be a migration, not a fix.
   */
  test("an authored name is hashed against itself, never against the pivot", () => {
    const row = ingredientRow(
      {
        ...factsOf(CATALOG[0]!),
        names: {
          fr: { value: "carotte", status: "edited" },
          en: { value: "carrot", status: "edited" },
        },
      },
      "agent",
    );

    expect(row.name.meta.fr?.sourceHash).toBe(hashText("carotte"));
    expect(row.name.meta.en?.sourceHash).toBe(hashText("carrot"));
  });

  /**
   * The CIQUAL row, and the case the pivot order exists for: a French name a source STATED beside
   * an English one the model rendered from it. The shopper typed English, so `sourceLocale` says
   * `en` — and it loses, because `edited` is the stronger claim about where a name came from.
   *
   * Pivoting on `en` here would hash the model's own English against itself and store nothing that
   * could ever notice `carotte` changing underneath it. That failure is invisible: the row looks
   * complete, and `isTranslationOutdated` simply never fires.
   */
  test("a name a source authored outranks the language the shopper typed in", () => {
    const row = ingredientRow(
      {
        ...factsOf(CATALOG[0]!),
        // Not `DEFAULT_LOCALE`, which a restore that recovered nothing would fall back to.
        sourceLocale: "fr",
        names: {
          fr: { value: "carotte", status: "edited" },
          en: { value: "carrot", status: "machine" },
        },
      },
      "agent",
    );

    expect(row.name.meta.en?.sourceHash).toBe(hashText("carotte"));
    expect(row.name.meta.fr?.sourceHash).toBe(hashText("carotte"));
  });

  /**
   * A Nutri-Score reads the fruit/vegetable share off the category, and that estimate is an input
   * to a derived field — so it lives in the sanitizer. If it ever moves back out to a call site,
   * two writers will estimate it differently and the same carrot will carry two grades.
   */
  test("the fruit/vegetable estimate is applied here, not left to the caller", () => {
    const vegetable = CATALOG.find((it) => it.category === "VEGETABLE" && it.diet)!;
    const row = ingredientRow(factsOf(vegetable), "seed");

    expect(row.nutriScore).toEqual(computeNutriScore(vegetable.nutrition, 100));
    expect(row.nutriScore).not.toEqual(computeNutriScore(vegetable.nutrition, 0));
  });
});

/** The row as `ingredients:export` ships it: everything but the columns a restore derives. */
const exported = ({ search: _search, nutriScore: _nutriScore, ...row }: ReturnType<typeof ingredientRow>) => row;

describe("functions/ingredients/restoredIngredientRow", () => {
  /** Across the whole catalog for the reason the ADR 0011 guard above is: one bad row has no symptom. */
  test("gives back every seeded row exactly as it was built", () => {
    for (const entry of CATALOG.filter((each) => each.diet)) {
      const row = ingredientRow(factsOf(entry), "seed");

      expect(restoredIngredientRow(exported(row))).toEqual(row);
    }
  });

  /**
   * A name the model rendered is hashed against the name it was rendered FROM, which the row does
   * not store. Recovered from the hash, the restored row keeps its derivation the right way round.
   */
  test("recovers the language a machine name was rendered from", () => {
    const [entry] = CATALOG.filter((each) => each.diet);
    const row = ingredientRow(
      {
        ...factsOf(entry!),
        names: { fr: { value: "Chocolat Lindt", status: "machine" }, en: { value: "Lindt chocolate", status: "machine" } },
        // Not `DEFAULT_LOCALE`, which a restore that recovered nothing would fall back to.
        sourceLocale: "fr",
      },
      "agent",
    );

    expect(restoredIngredientRow(exported(row)).name).toEqual(row.name);
  });

  test("refuses a row missing a fact it would otherwise have to guess", () => {
    const [entry] = CATALOG.filter((each) => each.diet);
    const row = exported(ingredientRow(factsOf(entry!), "seed"));

    expect(() => restoredIngredientRow({ ...row, allergens: undefined })).toThrow(`${entry!.fr} has no allergens`);
    expect(() => restoredIngredientRow({ ...row, nutrition: { ...row.nutrition, sugars: undefined } })).toThrow(
      "has no sugars",
    );
  });
});
