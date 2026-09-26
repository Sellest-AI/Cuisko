import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import type { PortableIngredient } from "@convex/schema/ingredientPayloads";

import { archiveNameOf, folderOf, localizeImage, packArchive, unpackArchive } from "../archive";

const ingredient = (fr: string, slug?: string): PortableIngredient => ({
  origin: { ingredientId: "k1", creationTime: 1 },
  row: {
    slug,
    name: { values: { fr, en: `${fr} (en)` }, meta: {} },
    emoji: "🥕",
    category: "VEGETABLE",
    defaultUnit: "pcs",
    defaultQuantity: 1,
    nutrition: { calories: 41, protein: 1, fat: 0, carbohydrates: 10 },
  },
  image: { url: "https://cdn.example.com/i/cut.png", base: { url: "https://cdn.example.com/i/base.webp" }, x: 3, y: 4 },
});

describe("folderOf", () => {
  it("is the slug when the seed gave one", () => {
    expect(folderOf(ingredient("Carotte", "carrot"))).toBe("carrot");
  });

  it("is the French name as a slug when there is no slug", () => {
    expect(folderOf(ingredient("Crème fraîche"))).toBe("creme-fraiche");
  });

  it("falls back to `ingredient` for a name with nothing to keep", () => {
    expect(folderOf(ingredient("???"))).toBe("ingredient");
  });
});

describe("localizeImage", () => {
  it("rewrites both URLs to file names in the folder, and lists their downloads", () => {
    const { ingredient: localized, files } = localizeImage(ingredient("Carotte"), "carotte");

    expect(localized.image).toEqual({ url: "image.png", base: { url: "image-base.webp" }, x: 3, y: 4 });
    expect(files).toEqual([
      { file: "carotte/image.png", url: "https://cdn.example.com/i/cut.png" },
      { file: "carotte/image-base.webp", url: "https://cdn.example.com/i/base.webp" },
    ]);
  });

  it("downloads nothing for an ingredient with no image", () => {
    const bare = { ...ingredient("Carotte"), image: undefined };

    expect(localizeImage(bare, "carotte")).toEqual({ ingredient: bare, files: [] });
  });
});

describe("packArchive and unpackArchive", () => {
  it("read back what was written, image bytes included", () => {
    const { ingredient: localized } = localizeImage(ingredient("Carotte"), "carotte");
    const manifest = { version: 1 as const, deployment: "dev:otter", exportedAt: "2026-09-26T00:00:00Z", ingredients: ["carotte"] };
    const zip = packArchive(manifest, { carotte: localized }, {
      "carotte/image.png": new Uint8Array([1, 2]),
      "carotte/image-base.webp": new Uint8Array([3]),
    });

    const unpacked = unpackArchive(zip);

    expect(unpacked.manifest).toEqual(manifest);
    expect(unpacked.ingredients[0]?.ingredient).toEqual(localized);
    expect(unpacked.ingredients[0]?.bytesOf("image.png")).toEqual(new Uint8Array([1, 2]));
    expect(() => unpacked.ingredients[0]?.bytesOf("missing.png")).toThrow("carotte/missing.png is not in the zip");
  });

  it("refuses a zip whose manifest is not an ingredients one", () => {
    const recipeZip = zipSync({ "ingredients.json": strToU8(JSON.stringify({ version: 1, deployment: "dev:otter", recipes: [] })) });

    expect(() => unpackArchive(recipeZip)).toThrow("ingredients.json is not an ingredients manifest");
  });
});

describe("archiveNameOf", () => {
  it("names the deployment and the day, with no colon", () => {
    expect(archiveNameOf("prod:happy-otter-123", "2026-09-26T10:00:00Z")).toBe("ingredients-prod-happy-otter-123-2026-09-26.zip");
  });
});
