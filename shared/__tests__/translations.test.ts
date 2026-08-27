import { describe, expect, test } from "vitest";

import { foldAccents } from "../translations";

describe("foldAccents", () => {
  test("removes combining accents", () => {
    expect(foldAccents("crème brûlée")).toBe("creme brulee");
  });

  /**
   * The pair no normalisation form handles: Unicode gives `œ` and `æ` no decomposition, canonical
   * or compatibility, because they are letters rather than typographic ligatures. Without the
   * explicit expansion "boeuf" is a token no indexed row carries.
   */
  test("expands the oe and ae ligatures, which NFD leaves whole", () => {
    expect(foldAccents("bœuf")).toBe("boeuf");
    expect(foldAccents("cœur de bœuf")).toBe("coeur de boeuf");
    expect(foldAccents("ex æquo")).toBe("ex aequo");
  });

  /** Case is the caller's to decide, so the uppercase forms expand in kind. */
  test("preserves case through the expansion", () => {
    expect(foldAccents("BŒUF")).toBe("BOEUF");
    expect(foldAccents("Œuf")).toBe("OEuf");
  });

  test("leaves an unaccented string untouched", () => {
    expect(foldAccents("onion")).toBe("onion");
  });
});
