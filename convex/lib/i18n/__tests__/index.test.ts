import { describe, expect, test } from "vitest";

import type { Localized } from "@convex/schema/i18n";

import { hasTranslation, hashText, isTranslationOutdated, resolvei18n, setTranslation } from "../index";

describe("resolvei18n", () => {
  test("returns the requested locale when present", () => {
    const field: Localized = { values: { fr: "Soupe à l'oignon", en: "Onion soup" }, meta: {} };
    expect(resolvei18n(field, "fr")).toBe("Soupe à l'oignon");
  });

  test("falls back to the default locale before any other", () => {
    const field: Localized = { values: { fr: "Soupe à l'oignon", en: "Onion soup" }, meta: {} };
    expect(resolvei18n({ ...field, values: { en: "Onion soup" } }, "fr")).toBe("Onion soup");
  });

  test("returns the only saved language when neither the locale nor the fallback exists", () => {
    const untranslated: Localized = { values: { fr: "Soupe à l'oignon" }, meta: {} };
    expect(resolvei18n(untranslated, "en")).toBe("Soupe à l'oignon");
  });

  test("is empty for a field with no value in any language", () => {
    expect(resolvei18n({ values: {}, meta: {} }, "en")).toBe("");
  });
});

describe("hasTranslation", () => {
  test("is false for a locale with no value", () => {
    expect(hasTranslation({ values: {}, meta: {} }, "en")).toBe(false);
  });

  test("is true for a present, unfailed value", () => {
    const field = setTranslation(undefined, "en", "Onion soup", "machine", hashText("Onion soup"));
    expect(hasTranslation(field, "en")).toBe(true);
  });

  test("is false for a value whose last run failed, present or not", () => {
    const field = setTranslation(undefined, "en", "", "failed", hashText(""));
    expect(hasTranslation(field, "en")).toBe(false);
  });
});

describe("isTranslationOutdated", () => {
  const SOURCE = "Soupe à l'oignon";
  const translated = (): Localized =>
    setTranslation(undefined, "en", "Onion soup", "machine", hashText(SOURCE));

  test("is false when the stored hash matches the source's current hash", () => {
    expect(isTranslationOutdated(translated(), "en", hashText(SOURCE))).toBe(false);
  });

  /**
   * The whole point: nothing about `en`'s own value or status changed, only the hash it is being
   * checked against — the source moved out from under a translation that still reads as fine on
   * its own terms.
   */
  test("is true once the source's hash no longer matches, even though the value is unchanged", () => {
    const staleAgainst = hashText("Soupe à l'oignon gratinée");
    expect(isTranslationOutdated(translated(), "en", staleAgainst)).toBe(true);
  });

  test("is true for a locale with no translation at all, regardless of the hash", () => {
    expect(isTranslationOutdated({ values: {}, meta: {} }, "en", hashText(SOURCE))).toBe(true);
  });

  test("is true for a locale whose last run failed, even if its stale hash happens to match", () => {
    const field = setTranslation(undefined, "en", "", "failed", hashText(SOURCE));
    expect(isTranslationOutdated(field, "en", hashText(SOURCE))).toBe(true);
  });

  /**
   * Hand-written text is never outdated. Its hash cannot match — it was never derived from a source
   * — so every other rule in this function would call it stale and hand it to the translator to
   * overwrite. `"edited"` is the only thing separating a cook's own words from a machine's.
   */
  test("is false for a locale the cook edited, even though its hash cannot match the source", () => {
    const field = setTranslation(undefined, "en", "My own words", "edited", hashText("My own words"));

    expect(isTranslationOutdated(field, "en", hashText(SOURCE))).toBe(false);
  });

  /** The status wins over absence of a matching hash, but not over the field being genuinely empty. */
  test("still reports a locale that was edited and then failed a later run", () => {
    const edited = setTranslation(undefined, "en", "My own words", "edited", hashText("My own words"));
    const failed = setTranslation(edited, "en", "", "failed", hashText(SOURCE));

    expect(isTranslationOutdated(failed, "en", hashText(SOURCE))).toBe(true);
  });
});
