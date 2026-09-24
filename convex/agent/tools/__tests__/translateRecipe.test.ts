import { describe, expect, expectTypeOf, it } from "vitest";

import { SUPPORTED_LOCALES } from "@shared/translations";

import {
  modelRecipeSchemaExtended,
  toTranslatedRecipes,
  type TranslatedRecipe,
} from "../translateRecipe";

/**
 * The generation itself is not tested here — it is a model call, and choosing the model behind it
 * is what `translateRecipe.manual.test.ts` is for. What is tested is the boundary right after it,
 * where an answer that looks fine becomes a recipe filed under the wrong language.
 *
 * That boundary is doing something `sanitizeRecipe`'s does not: it is the run-time half of a
 * compile-time promise. `run(ctx, { locales: ["fr"] })` is TYPED as returning `"fr"`, so the parse
 * has to be what makes that true of the value — hence the locale enum being built from the
 * requested locales rather than from `SUPPORTED_LOCALES`.
 */
const _recipe = (title: string) => ({
  title,
  description: "Pasta, egg and pork, in the time the water takes to boil.",
  instructions: [{ title: null, steps: [{ instruction: "Boil the water", hints: [] }] }],
});

const _answer = (...entries: { locale: string; recipe?: unknown }[]) => ({
  translations: entries.map(({ locale, recipe }) => ({
    locale,
    recipe: recipe ?? _recipe("Carbonara"),
  })),
});

describe("toTranslatedRecipes", () => {
  it("returns one entry per language that was asked for", () => {
    const parsed = toTranslatedRecipes(_answer({ locale: "fr" }, { locale: "en" }), ["fr", "en"]);

    expect(parsed.map(({ locale }) => locale)).toEqual(["fr", "en"]);
  });

  it("keeps the locale attached to its own recipe, whatever order they arrive in", () => {
    const parsed = toTranslatedRecipes(
      _answer(
        { locale: "en", recipe: _recipe("Carbonara") },
        { locale: "fr", recipe: _recipe("Carbonara à la crème") },
      ),
      ["fr", "en"],
    );

    // Read by locale, never by index — the reason the locale travels inside the entry.
    expect(parsed.find(({ locale }) => locale === "fr")?.recipe.title).toBe("Carbonara à la crème");
  });

  it("rejects a language that was not asked for, even a supported one", () => {
    expect(() => toTranslatedRecipes(_answer({ locale: "en" }), ["fr"])).toThrow();
  });

  it("rejects a language the app does not support", () => {
    expect(() => toTranslatedRecipes(_answer({ locale: "de" }), ["fr"])).toThrow();
  });

  it("rejects an answer missing one of the requested languages", () => {
    expect(() => toTranslatedRecipes(_answer({ locale: "fr" }), ["fr", "en"])).toThrow();
  });

  it("rejects an answer that translated one language twice instead of both", () => {
    expect(() => toTranslatedRecipes(_answer({ locale: "fr" }, { locale: "fr" }), ["fr", "en"]))
      .toThrow();
  });

  it("rejects an answer with no translations at all", () => {
    expect(() => toTranslatedRecipes({ translations: [] }, ["fr"])).toThrow();
  });

  it("rejects a translation missing a title outright", () => {
    const recipe = { description: "Des pâtes.", instructions: [{ steps: [{ instruction: "Bouillir", hints: [] }] }] };

    expect(() => toTranslatedRecipes(_answer({ locale: "fr", recipe }), ["fr"])).toThrow();
  });

  /**
   * Pinning the seam rather than endorsing it. `title` is REQUIRED, and `parseModelOutput` only
   * turns a nothing-word into an absence on a field the schema lets it drop — a required one keeps
   * whatever the model wrote, and `z.string()` accepts "N/A" and "  " alike. So the schema is the
   * only thing standing between a model shrugging and a recipe titled "N/A" in French, and today
   * it does not stand there. Give `title` a `.min(1)` and a nothing-word guard and this test is
   * what tells you the behaviour changed on purpose.
   */
  it("keeps a required title exactly as the model wrote it, nothing-word included", () => {
    for (const title of ["N/A", "  "])
      expect(toTranslatedRecipes(_answer({ locale: "fr", recipe: _recipe(title) }), ["fr"])[0]
        ?.recipe.title).toBe(title);
  });

  it("drops a group title the model wrote as the word for having none", () => {
    const recipe = { ..._recipe("Carbonara"), instructions: [{ title: "N/A", steps: [{ instruction: "Bouillir", hints: [] }] }] };

    expect(toTranslatedRecipes(_answer({ locale: "fr", recipe }), ["fr"])[0]?.recipe.instructions[0])
      .toEqual({ steps: [{ instruction: "Bouillir", hints: [] }] });
  });

  it("keeps a real group title", () => {
    const recipe = { ..._recipe("Carbonara"), instructions: [{ title: "  Sauce  ", steps: [{ instruction: "Bouillir", hints: [] }] }] };

    expect(toTranslatedRecipes(_answer({ locale: "fr", recipe }), ["fr"])[0]?.recipe
      .instructions[0]?.title).toBe("Sauce");
  });

  /** Translation writes the same `instructions` field, so it gets the same tolerance for "no hints". */
  it("reads a step whose hints the model left null as a step with no hints", () => {
    const recipe = {
      ..._recipe("Carbonara"),
      instructions: [{ steps: [{ instruction: "Bouillir", hints: null }, { instruction: "Égoutter", hints: ["", "Garder un peu d'eau"] }] }],
    };

    expect(toTranslatedRecipes(_answer({ locale: "fr", recipe }), ["fr"])[0]?.recipe.instructions[0]?.steps).toEqual([
      { instruction: "Bouillir", hints: [] },
      { instruction: "Égoutter", hints: ["Garder un peu d'eau"] },
    ]);
  });

  it("rejects an answer that is not the shape at all", () => {
    expect(() => toTranslatedRecipes({ translations: [{ locale: "fr" }] }, ["fr"])).toThrow();
    expect(() => toTranslatedRecipes([{ locale: "fr", recipe: _recipe("Carbonara") }], ["fr"]))
      .toThrow();
  });

  /**
   * Not a runtime assertion — `expectTypeOf` erases to nothing. It is `pnpm typecheck` that runs
   * this one, because `tsc -p convex/tsconfig.json` covers this file, and it fails the moment the
   * generic stops reaching the call site: drop the `const` on `L`, or let `createTool`'s widened
   * `run` win the intersection, and `"fr"` widens back to `Locale` right here.
   */
  it("narrows the result to the locales the caller named", () => {
    expectTypeOf(toTranslatedRecipes(_answer({ locale: "fr" }), ["fr"]))
      .toEqualTypeOf<TranslatedRecipe<"fr">[]>();

    expectTypeOf(toTranslatedRecipes(_answer({ locale: "fr" }, { locale: "en" }), SUPPORTED_LOCALES))
      .toEqualTypeOf<TranslatedRecipe<"en" | "fr">[]>();
  });
});

/**
 * The INPUT schema, which is where the localized ingredient names live.
 *
 * Worth its own block because `.extend()` on a key the base schema already has is a REPLACEMENT
 * rather than a merge, and nothing else in the codebase says so. Get it wrong — write `.merge()`,
 * or name the field something the base does not have — and the tool goes on accepting the
 * single-language `{ name, quantity, unit }` beside the new shape, the caller keeps sending it, and
 * the only symptom is a model quietly back to guessing what "cebolleta" is in English.
 */
describe("modelRecipeSchemaExtended", () => {
  const _ingredient = { names: { en: "scallion", fr: "oignon nouveau" } };

  const _base = {
    title: "Carbonara",
    description: "Pasta, egg and pork.",
    servings: 2,
    difficulty: 1,
    cuisine: "italian",
    tags: ["main"],
    equipments: [],
    timings: { preparation: 10 },
    instructions: [{ title: null, steps: [{ instruction: "Boil the water", hints: [] }] }],
  };

  const _parse = (ingredients: unknown[]) =>
    modelRecipeSchemaExtended.parse({ ..._base, ingredients });

  it("takes an ingredient named in every supported locale", () => {
    expect(_parse([_ingredient]).ingredients[0]).toEqual(_ingredient);
  });

  it("takes an ingredient the catalog has only one name for", () => {
    expect(_parse([{ ..._ingredient, names: { fr: "oignon nouveau" } }]).ingredients[0]?.names)
      .toEqual({ fr: "oignon nouveau" });
  });

  /** The whole point of the extend: the shape it replaced must no longer get through. */
  it("rejects the single-language ingredient the base schema takes", () => {
    expect(() => _parse([{ name: "scallion", quantity: 2, unit: "pcs" }])).toThrow();
  });

  /**
   * A quantity sent anyway does not reach the model. It is not merely unused — the field being
   * absent is what stopped two models rewriting a step's amount to match the recipe's total, so
   * "stripped" and "ignored" are not the same outcome here.
   */
  it("strips a quantity or a unit rather than passing it through", () => {
    expect(_parse([{ ..._ingredient, quantity: 2, unit: "pcs" }]).ingredients[0])
      .toEqual(_ingredient);
  });

  it("keeps the base schema's rules on the fields the extend left alone", () => {
    expect(() => _parse([{ names: { en: 42 } }])).toThrow();
    expect(() => modelRecipeSchemaExtended.parse({ ..._base, cuisine: "martian", ingredients: [] }))
      .toThrow();
  });
});
