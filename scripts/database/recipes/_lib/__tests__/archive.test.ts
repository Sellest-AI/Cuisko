import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import type { PortableRecipe } from "@convex/schema/recipePayloads";

import {
  archiveNameOf,
  folderOf,
  imageFileOf,
  imageFilesOf,
  localizeImages,
  packArchive,
  unpackArchive,
  withoutImages,
} from "../archive";

const recipe = (title: string, images: PortableRecipe["images"] = {}): PortableRecipe => ({
  origin: { recipeId: "r1" as PortableRecipe["origin"]["recipeId"], creationTime: 1 },
  row: {
    title: { values: { fr: title }, meta: {} },
    description: { values: { fr: "" }, meta: {} },
    instructions: { values: { fr: "- Cuire." }, meta: {} },
    servings: 4,
    equipments: [],
    difficulty: 1,
    tags: [],
    cuisine: "french",
    timings: {},
    search: { fr: "", en: "" },
    isVegan: false,
    isVegetarian: false,
    isPescatarian: false,
    isGlutenFree: false,
    isDairyFree: false,
    isNutFree: false,
    updatedAt: 1,
  },
  ingredients: [],
  images,
});

describe("folderOf", () => {
  it("slugs the French title, folding accents and punctuation", () => {
    expect(folderOf(recipe("Bœuf bourguignon à l'ancienne !"))).toBe("boeuf-bourguignon-a-l-ancienne");
    expect(folderOf(recipe("Pâtes  (carbonara)"))).toBe("pates-carbonara");
  });

  it("falls back to the English title, then to a fixed name", () => {
    const english = recipe("x");
    english.row.title.values = { en: "Apple pie" };
    expect(folderOf(english)).toBe("apple-pie");

    expect(folderOf(recipe("???"))).toBe("recipe");
  });
});

describe("imageFileOf", () => {
  it("names the file by role, with the source extension", () => {
    expect(imageFileOf("plate-base", "https://cdn.example.com/public/abc.webp?x=1")).toBe("plate-base.webp");
  });

  it("gives no extension when the source has none", () => {
    expect(imageFileOf("cover", "https://cdn.example.com/blob/abc")).toBe("cover");
  });
});

describe("localizeImages", () => {
  it("rewrites every image url to its file beside the recipe and lists the downloads", () => {
    const { recipe: localized, files } = localizeImages(
      recipe("Tarte", {
        cover: { url: "https://cdn.example.com/c.webp" },
        plate: { url: "https://cdn.example.com/p.png", base: { url: "https://cdn.example.com/b.webp" }, x: 1, y: 2 },
      }),
      "tarte",
    );

    expect(localized.images).toEqual({
      cover: { url: "cover.webp" },
      plate: { url: "plate.png", base: { url: "plate-base.webp" }, x: 1, y: 2 },
    });
    expect(files).toEqual([
      { file: "tarte/cover.webp", url: "https://cdn.example.com/c.webp" },
      { file: "tarte/plate.png", url: "https://cdn.example.com/p.png" },
      { file: "tarte/plate-base.webp", url: "https://cdn.example.com/b.webp" },
    ]);
  });

  it("has nothing to download for a recipe without images", () => {
    const { recipe: localized, files } = localizeImages(recipe("Tarte"), "tarte");

    expect(localized.images).toEqual({ cover: undefined, plate: undefined });
    expect(files).toEqual([]);
  });
});

describe("withoutImages", () => {
  const localized = () =>
    localizeImages(
      recipe("Tarte", {
        cover: { url: "https://cdn.example.com/c.webp" },
        plate: { url: "https://cdn.example.com/p.png", base: { url: "https://cdn.example.com/b.webp" }, x: 1, y: 2 },
      }),
      "tarte",
    ).recipe;

  it("drops the image whose file could not be downloaded and keeps the rest", () => {
    expect(withoutImages(localized(), ["tarte/cover.webp"]).images).toEqual({
      cover: undefined,
      plate: { url: "plate.png", base: { url: "plate-base.webp" }, x: 1, y: 2 },
    });
  });

  it("drops the whole plate when only its base is missing", () => {
    expect(withoutImages(localized(), ["tarte/plate-base.webp"]).images).toEqual({
      cover: { url: "cover.webp" },
      plate: undefined,
    });
  });

  it("changes nothing when nothing is missing", () => {
    expect(withoutImages(localized(), []).images).toEqual(localized().images);
  });

  it("lists only the files the recipe still refers to, so a dropped plate's cut-out is not kept", () => {
    expect(imageFilesOf(localized(), "tarte")).toEqual(["tarte/cover.webp", "tarte/plate.png", "tarte/plate-base.webp"]);
    expect(imageFilesOf(withoutImages(localized(), ["tarte/plate-base.webp"]), "tarte")).toEqual(["tarte/cover.webp"]);
  });
});

describe("packArchive", () => {
  it("writes the manifest, each recipe in its folder, and every image at the path the recipe names", () => {
    const { recipe: localized } = localizeImages(recipe("Tarte", { cover: { url: "https://cdn.example.com/c.webp" } }), "tarte");
    const manifest = {
      version: 1 as const,
      deployment: "dev:happy-otter-123",
      exportedAt: "2026-09-21T10:00:00.000Z",
      recipes: ["tarte"],
    };

    const zip = unzipSync(packArchive(manifest, { tarte: localized }, { "tarte/cover.webp": new Uint8Array([1, 2, 3]) }));

    expect(Object.keys(zip).sort()).toEqual(["catalog.json", "tarte/cover.webp", "tarte/recipe.json"]);
    expect(JSON.parse(strFromU8(zip["catalog.json"]!))).toEqual(manifest);
    expect(JSON.parse(strFromU8(zip["tarte/recipe.json"]!))).toEqual(localized);
    expect([...zip["tarte/cover.webp"]!]).toEqual([1, 2, 3]);
  });
});

describe("unpackArchive", () => {
  const manifest = {
    version: 1 as const,
    deployment: "dev:happy-otter-123",
    exportedAt: "2026-09-21T10:00:00.000Z",
    recipes: ["tarte"],
  };

  it("reads back what packArchive wrote, with each recipe's image bytes reachable by name", () => {
    const { recipe: localized } = localizeImages(recipe("Tarte", { cover: { url: "https://cdn.example.com/c.webp" } }), "tarte");
    const zip = packArchive(manifest, { tarte: localized }, { "tarte/cover.webp": new Uint8Array([1, 2, 3]) });

    const unpacked = unpackArchive(zip);

    expect(unpacked.manifest).toEqual(manifest);
    expect(unpacked.recipes.map((entry) => entry.folder)).toEqual(["tarte"]);
    expect(unpacked.recipes[0]!.recipe).toEqual(localized);
    expect([...unpacked.recipes[0]!.bytesOf("cover.webp")]).toEqual([1, 2, 3]);
    expect(() => unpacked.recipes[0]!.bytesOf("plate.png")).toThrow(/not in the zip/);
  });

  it("refuses a zip whose manifest names a folder that is not there", () => {
    const zip = packArchive({ ...manifest, recipes: ["tarte", "gone"] }, { tarte: recipe("Tarte") }, {});

    expect(() => unpackArchive(zip)).toThrow(/gone\/recipe.json/);
  });

  it("refuses a zip that is not a catalog", () => {
    const zip = zipSync({ "catalog.json": strToU8("{}") });

    expect(() => unpackArchive(zip)).toThrow(/not a catalog manifest/);
  });
});

describe("archiveNameOf", () => {
  it("names the zip by deployment and date, without the colon Windows refuses", () => {
    expect(archiveNameOf("dev:happy-otter-123", "2026-09-21T10:00:00.000Z")).toBe(
      "catalog-dev-happy-otter-123-2026-09-21.zip",
    );
  });
});
