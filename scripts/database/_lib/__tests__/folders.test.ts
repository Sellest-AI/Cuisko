import { describe, expect, it } from "vitest";

import { imageFileNameOf, slugOf, uniqueFolder } from "../folders";

describe("slugOf", () => {
  it("folds accents and ligatures, and joins the words with one dash", () => {
    expect(slugOf("Bœuf bourguignon à l'ancienne !")).toBe("boeuf-bourguignon-a-l-ancienne");
    expect(slugOf("Crème brûlée")).toBe("creme-brulee");
  });

  it("is empty for text with no letter or digit", () => {
    expect(slugOf("???")).toBe("");
  });
});

describe("uniqueFolder", () => {
  it("numbers a folder already taken", () => {
    expect(uniqueFolder("tarte", new Set())).toBe("tarte");
    expect(uniqueFolder("tarte", new Set(["tarte"]))).toBe("tarte-2");
    expect(uniqueFolder("tarte", new Set(["tarte", "tarte-2"]))).toBe("tarte-3");
  });
});

describe("imageFileNameOf", () => {
  it("keeps the extension of the URL's path, and nothing of its query", () => {
    expect(imageFileNameOf("image", "https://cdn.example.com/a/b.png?v=2")).toBe("image.png");
  });

  it("adds no extension when the URL has none", () => {
    expect(imageFileNameOf("image", "https://cdn.example.com/a/b")).toBe("image");
  });
});
