import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";


import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
import { ANONYMOUS_AVATAR_SEED, avatarSeed } from "@shared/avatars";
import { FAT_USE_SHARE, type FatUse } from "@shared/ingredients";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { loadRecipe } from "../loadRecipe";
import { loadRecipeContent } from "../recipeContent";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const seedRecipe = ({ chef }: { chef?: string | null } = { chef: "Franck" }) =>
  t.run(async (ctx) => {
    const userId =
      chef === null ? undefined : await ctx.db.insert("users", chef ? { name: chef } : {});

    return insertTestRecipe(ctx.db, {
      title: { values: { en: "Onion soup" }, meta: {} },
      description: { values: { en: "A winter soup." }, meta: {} },
      instructions: { values: { en: "Base\n- Slice the onions." }, meta: {} },
      servings: 4,
      difficulty: 2,
      userId,
      timings: { preparation: 15 },
      isVegetarian: true,
      isGlutenFree: true,
      isNutFree: true,
    });
  });

/**
 * One line of the recipe, with the catalog row behind it.
 *
 * `gramsPerPiece` is what lets a `pcs` line reach grams, so it is the switch every nutrition test
 * here flips: an ingredient without it is a line `toGrams` refuses, which is the case the refusals
 * below are about.
 */
const seedLine = (
  recipeId: Id<"recipes">,
  ingredient: {
    name: string;
    category: "VEGETABLE" | "DAIRY" | "OIL";
    /** Defaulted, because only the emoji test cares which glyph a line carries. */
    emoji?: string;
    gramsPerPiece?: number;
    /**
     * A generated photo for this ingredient, with the renditions given. Only the image tests pass
     * it — every other line here is a catalog row that has no photo yet, which is most of them.
     */
    image?: { url: string; renditions?: { url: string; px: number }[]; deleted?: boolean };
  },
  { position, quantity, fatUse }: { position: number; quantity: number; fatUse?: FatUse },
) =>
  t.run(async (ctx) => {
    let imageId: Id<"images"> | undefined;
    if (ingredient.image) {
      imageId = await ctx.db.insert("images", {
        hasAlpha: true,
        key: `public/${ingredient.image.url}`,
        url: ingredient.image.url,
        width: 512,
        height: 512,
        size: 100_000,
        mimeType: "image/webp",
        tags: ["IMAGE", "OBJECT"],
        updatedAt: Date.now(),
      });

      for (const rendition of ingredient.image.renditions ?? []) {
        await ctx.db.insert("imageSizes", {
          imageId,
          quality: 40,
          key: `public/${rendition.url}`,
          url: rendition.url,
          width: rendition.px,
          height: rendition.px,
          size: rendition.px * 10,
        });
      }

      // Leaves the ingredient pointing at an id that resolves to nothing.
      if (ingredient.image.deleted) await ctx.db.delete(imageId);
    }

    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { en: ingredient.name }, meta: {} },
      category: ingredient.category,
      emoji: ingredient.emoji ?? "🥕",
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 100, protein: 10, fat: 5, carbohydrates: 20 },
      updatedAt: Date.now(),
      ...(imageId !== undefined && { imageId }),
      ...(ingredient.gramsPerPiece !== undefined && { gramsPerPiece: ingredient.gramsPerPiece }),
    });

    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position,
      quantity,
      unit: "pcs",
      ...(fatUse && { fatUse }),
      updatedAt: Date.now(),
    });
  });

beforeEach(() => {
  t = convexTest(schema, modules);
});

/**
 * `loadRecipe` takes the document or its id: `ownedQuery*` already holds the row it loaded to prove
 * ownership, while an internal action or a scheduled job holds only an id. What is pinned here is
 * that the choice stays a convenience — the two branches must not become two answers.
 *
 * Neither branch checks ownership, and nothing here implies one does. That belongs to the router
 * builder; see `router/recipes/__tests__/getOne.test.ts` for where it is asserted.
 */
describe("functions/recipes/loadRecipe", () => {
  test("resolves the same recipe from an id as from the document", async () => {
    const recipeId = await seedRecipe();

    const [fromId, fromDoc] = await t.run(async (ctx) => [
      await loadRecipe(ctx, { recipe: recipeId, locale: "en" }),
      await loadRecipe(ctx, { recipe: (await ctx.db.get(recipeId))!, locale: "en" }),
    ]);

    expect(fromId).toEqual(fromDoc);
    expect(fromId.title).toBe("Onion soup");
  });

  test("refuses an id that names no recipe", async () => {
    const recipeId = await seedRecipe();
    await t.run((ctx) => ctx.db.delete(recipeId));

    await expect(
      t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" })),
    ).rejects.toThrow();
  });

  /**
   * A line whose catalog row is gone cannot be named. The cascade should make this unreachable, so
   * what is pinned is the behaviour if it ever is: one line fewer, not a quantity with no name.
   */
  test("drops a line whose ingredient no longer exists", async () => {
    const recipeId = await seedRecipe();

    await t.run(async (ctx) => {
      const ingredientId = await ctx.db.insert("ingredients", {
        name: { values: { en: "Onion" }, meta: {} },
        category: "VEGETABLE",
        emoji: "🧅",
        defaultUnit: "pcs",
        defaultQuantity: 1,
        nutrition: { calories: 40, protein: 1, fat: 0, carbohydrates: 9 },
        updatedAt: Date.now(),
      });

      await ctx.db.insert("recipeIngredients", {
        recipeId,
        ingredientId,
        position: 0,
        quantity: 4,
        unit: "pcs",
        updatedAt: Date.now(),
      });

      await ctx.db.delete(ingredientId);
    });

    const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

    expect(recipe.ingredients).toEqual([]);
  });

  /** The tile's stand-in until a photo exists, carried through in the recipe's own order. */
  test("carries each line's emoji, in position order", async () => {
    const recipeId = await seedRecipe();
    await seedLine(
      recipeId,
      { name: "Onion", category: "VEGETABLE", emoji: "🧅" },
      { position: 0, quantity: 2 },
    );
    await seedLine(
      recipeId,
      { name: "Butter", category: "DAIRY", emoji: "🧈" },
      { position: 1, quantity: 1 },
    );

    const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

    expect(recipe.ingredients.map((line) => line.emoji)).toEqual(["🧅", "🧈"]);
  });

  /** What the tile converts a line through when a cook taps it: the row's ratios, not a result. */
  test("carries each line's conversion facts from its catalog row", async () => {
    const recipeId = await seedRecipe();
    await seedLine(recipeId, { name: "Onion", category: "VEGETABLE", gramsPerPiece: 150 }, { position: 0, quantity: 2 });
    await seedLine(recipeId, { name: "Butter", category: "DAIRY" }, { position: 1, quantity: 1 });

    const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

    expect(recipe.ingredients.map((line) => line.conversion)).toEqual([
      { defaultUnit: "pcs", gramsPerPiece: 150 },
      { defaultUnit: "pcs" },
    ]);
  });

  /**
   * A line carries the THUMBNAIL url and nothing else — not the image document the catalog hands
   * out. A twenty-ingredient recipe would otherwise ship twenty documents of five sizes each to
   * draw twenty 48pt tiles.
   */
  describe("the line's photo", () => {
    test("carries the thumbnail url when the catalog row has a photo", async () => {
      const recipeId = await seedRecipe();
      await seedLine(
        recipeId,
        {
          name: "Onion",
          category: "VEGETABLE",
          image: { url: "onion.webp", renditions: [{ url: "onion-150.webp", px: 150 }] },
        },
        { position: 0, quantity: 2 },
      );

      const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

      expect(recipe.ingredients[0]?.imageUrl).toBe("onion-150.webp");
    });

    /** With no rendition small enough, the thumbnail slot falls back to the original. */
    test("falls back to the original when there is no small rendition", async () => {
      const recipeId = await seedRecipe();
      await seedLine(
        recipeId,
        { name: "Onion", category: "VEGETABLE", image: { url: "onion.webp" } },
        { position: 0, quantity: 2 },
      );

      const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

      expect(recipe.ingredients[0]?.imageUrl).toBe("onion.webp");
    });

    test("leaves it absent for a row with no photo", async () => {
      const recipeId = await seedRecipe();
      await seedLine(recipeId, { name: "Onion", category: "VEGETABLE" }, { position: 0, quantity: 2 });

      const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

      expect(recipe.ingredients[0]?.imageUrl).toBeUndefined();
      expect(recipe.ingredients[0]?.emoji).toBe("🥕"); // the tile still draws something
    });

    /** A pointer at a deleted image must read as "no photo", not crash the whole recipe. */
    test("leaves it absent when the image row is gone", async () => {
      const recipeId = await seedRecipe();
      await seedLine(
        recipeId,
        {
          name: "Onion",
          category: "VEGETABLE",
          image: { url: "onion.webp", deleted: true },
        },
        { position: 0, quantity: 2 },
      );

      const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

      expect(recipe.ingredients).toHaveLength(1); // the line survives
      expect(recipe.ingredients[0]?.imageUrl).toBeUndefined();
    });

    test("resolves a mix of photographed and bare lines, in position order", async () => {
      const recipeId = await seedRecipe();
      await seedLine(
        recipeId,
        {
          name: "Onion",
          category: "VEGETABLE",
          image: { url: "onion.webp", renditions: [{ url: "onion-150.webp", px: 150 }] },
        },
        { position: 0, quantity: 2 },
      );
      await seedLine(recipeId, { name: "Butter", category: "DAIRY" }, { position: 1, quantity: 1 });

      const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

      expect(recipe.ingredients.map((line) => line.imageUrl)).toEqual(["onion-150.webp", undefined]);
    });
  });

  /**
   * The page header draws the large size and a card the medium one, from one read of the image.
   * No rendition sits between 600 and 1024px on the ladder, so `large` is the original.
   */
  describe("the cover", () => {
    const seedCover = (recipeId: Id<"recipes">, { deleted = false } = {}) =>
      t.run(async (ctx) => {
        const coverImageId = await ctx.db.insert("images", {
          hasAlpha: false,
          key: "public/cover.webp",
          url: "cover.webp",
          width: 1536,
          height: 1024,
          size: 400_000,
          mimeType: "image/webp",
          tags: ["IMAGE"],
          updatedAt: Date.now(),
        });

        await ctx.db.insert("imageSizes", {
          imageId: coverImageId,
          quality: 70,
          key: "public/cover-600.webp",
          url: "cover-600.webp",
          width: 600,
          height: 400,
          size: 6_000,
        });

        await ctx.db.patch(recipeId, { coverImageId });
        if (deleted) await ctx.db.delete(coverImageId);
      });

    test("carries the medium url for the card and the large one for the header", async () => {
      const recipeId = await seedRecipe();
      await seedCover(recipeId);

      const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

      expect(recipe.coverImageUrl).toBe("cover-600.webp");
      expect(recipe.coverImageLargeUrl).toBe("cover.webp");
    });

    test("leaves both absent for a recipe with no cover", async () => {
      const recipeId = await seedRecipe();

      const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

      expect(recipe.coverImageUrl).toBeUndefined();
      expect(recipe.coverImageLargeUrl).toBeUndefined();
    });

    /** A pointer at a deleted image must read as "no cover", not crash the whole recipe. */
    test("leaves both absent when the image row is gone", async () => {
      const recipeId = await seedRecipe();
      await seedCover(recipeId, { deleted: true });

      const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

      expect(recipe.title).toBe("Onion soup");
      expect(recipe.coverImageUrl).toBeUndefined();
      expect(recipe.coverImageLargeUrl).toBeUndefined();
    });
  });

  /** The stored key, not a heading — the screen groups by it and owns the words and the order. */
  test("carries each line's category, in position order", async () => {
    const recipeId = await seedRecipe();
    await seedLine(recipeId, { name: "Butter", category: "DAIRY" }, { position: 1, quantity: 1 });
    await seedLine(recipeId, { name: "Onion", category: "VEGETABLE" }, { position: 0, quantity: 2 });

    const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

    expect(recipe.ingredients.map((line) => [line.name, line.category])).toEqual([
      ["Onion", "VEGETABLE"],
      ["Butter", "DAIRY"],
    ]);
  });

  /**
   * Both halves of the same promise: a recipe every line of which can be weighed reports its
   * macros, and one with a single unweighable line reports none at all rather than a total that
   * silently leaves that ingredient out.
   */
  test("totals the recipe only when every line can be weighed", async () => {
    const weighable = await seedRecipe();
    await seedLine(
      weighable,
      { name: "Onion", category: "VEGETABLE", gramsPerPiece: 100 },
      { position: 0, quantity: 2 },
    );

    const totalled = await t.run((ctx) => loadRecipe(ctx, { recipe: weighable, locale: "en" }));

    // 2 pieces × 100 g, at 100 kcal per 100 g, over the 4 servings the recipe is written for.
    expect(totalled.nutrition?.grams).toBe(200);
    expect(totalled.nutrition?.perServing.calories).toBe(50);

    const partial = await seedRecipe();
    await seedLine(
      partial,
      { name: "Onion", category: "VEGETABLE", gramsPerPiece: 100 },
      { position: 0, quantity: 2 },
    );
    await seedLine(partial, { name: "Butter", category: "DAIRY" }, { position: 1, quantity: 1 });

    const unweighable = await t.run((ctx) => loadRecipe(ctx, { recipe: partial, locale: "en" }));

    expect(unweighable.nutrition).toBeUndefined();
  });

  /**
   * The recipe screen reads the oil a cook fries in as only partly eaten: the same 200 g line that
   * totals 50 kcal a serving above counts `FAT_USE_SHARE.fried` of itself once it is tagged. The tag
   * also travels on the line, because an edit rebuilds its lines from this payload.
   */
  test("counts the eaten share of a frying oil, and ships the line's tag", async () => {
    const recipe = await seedRecipe();
    await seedLine(
      recipe,
      { name: "Oil", category: "OIL", gramsPerPiece: 100 },
      { position: 0, quantity: 2, fatUse: "fried" },
    );

    const loaded = await t.run((ctx) => loadRecipe(ctx, { recipe, locale: "en" }));

    expect(loaded.nutrition?.grams).toBe(200 * FAT_USE_SHARE.fried);
    expect(loaded.nutrition?.perServing.calories).toBe((200 * FAT_USE_SHARE.fried) / 4);
    expect(loaded.ingredients[0]!.fatUse).toBe("fried");
  });

  /** A recipe with no lines has no nutrition to report, and zero is not the answer. */
  test("reports no nutrition for a recipe with no lines", async () => {
    const recipeId = await seedRecipe();

    const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

    expect(recipe.nutrition).toBeUndefined();
  });

  /** The timings stay unsummed beside the total the card already carries. */
  test("carries the timings breakdown as well as their sum", async () => {
    const recipeId = await seedRecipe();

    const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

    expect(recipe.timings).toEqual({ preparation: 15 });
    expect(recipe.minutes).toBe(15);
  });

  /**
   * Three ways to have no chef, and all of them are the same absence: the screen decides what an
   * uncredited recipe looks like, so nothing here invents a name for it.
   */
  test("credits the owner, and nobody when there is no name to credit", async () => {
    const named = await seedRecipe();
    const nameless = await seedRecipe({ chef: undefined });
    const ownerless = await seedRecipe({ chef: null });

    const [withChef, withoutName, withoutOwner] = await t.run(async (ctx) => [
      await loadRecipe(ctx, { recipe: named, locale: "en" }),
      await loadRecipe(ctx, { recipe: nameless, locale: "en" }),
      await loadRecipe(ctx, { recipe: ownerless, locale: "en" }),
    ]);

    const ownerId = await t.run(async (ctx) => (await ctx.db.get(named))!.userId!);

    expect(withChef.chef).toEqual({ name: "Franck", seed: avatarSeed(ownerId) });
    expect(withoutName.chef).toBeUndefined();
    expect(withoutOwner.chef).toBeUndefined();
  });

  /**
   * A deleted author's account is a tombstone with no name, like a living password account. Only
   * `deletedAt` tells them apart, and only the tombstone is credited as anonymous; the payload still
   * names nobody and ships no `userId`.
   */
  test("credits a deleted author as anonymous, with the same face on every recipe", async () => {
    const tombstoned = await seedRecipe({ chef: undefined });
    const ownerId = await t.run(async (ctx) => (await ctx.db.get(tombstoned))!.userId!);
    const another = await t.run(async (ctx) => {
      const recipe = (await ctx.db.get(tombstoned))!;
      const { _id, _creationTime, ...fields } = recipe;
      return insertTestRecipe(ctx.db, { ...fields, ...(await loadRecipeContent(ctx, recipe._id)) });
    });
    await t.run((ctx) =>
      ctx.db.insert("usersExtended", { userId: ownerId, role: "USER", deletedAt: Date.now(), updatedAt: Date.now() }),
    );

    const [first, second] = await t.run(async (ctx) => [
      await loadRecipe(ctx, { recipe: tombstoned, locale: "en" }),
      await loadRecipe(ctx, { recipe: another, locale: "en" }),
    ]);

    expect(first.chef).toEqual({ isAnonymous: true, seed: avatarSeed(ownerId) });
    expect(second.chef).toEqual(first.chef);
    expect(JSON.stringify(first)).not.toContain(ownerId);
  });

  /**
   * An erased account's recipes are archived and detached, so they reach here with no author at all.
   * Archived is what tells them from the catalog: a catalog recipe is never archived (archiving is the
   * owner's, and the catalog export leaves archived rows out), so only a live ownerless one is Cuisko's.
   */
  test("credits an archived recipe with no author as anonymous, and a live one to nobody", async () => {
    const erased = await seedRecipe({ chef: null });
    const catalog = await seedRecipe({ chef: null });
    await t.run((ctx) => ctx.db.patch(erased, { isArchived: true }));

    const [fromErased, fromCatalog] = await t.run(async (ctx) => [
      await loadRecipe(ctx, { recipe: erased, locale: "en" }),
      await loadRecipe(ctx, { recipe: catalog, locale: "en" }),
    ]);

    expect(fromErased.chef).toEqual({ isAnonymous: true, seed: ANONYMOUS_AVATAR_SEED });
    expect(fromCatalog.chef).toBeUndefined();
  });

  test("a living account with no name is still uncredited, not anonymous", async () => {
    const nameless = await seedRecipe({ chef: undefined });
    const ownerId = await t.run(async (ctx) => (await ctx.db.get(nameless))!.userId!);
    await t.run((ctx) =>
      ctx.db.insert("usersExtended", { userId: ownerId, role: "USER", updatedAt: Date.now() }),
    );

    const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: nameless, locale: "en" }));

    expect(recipe.chef).toBeUndefined();
  });

  /**
   * The reason the seed is derived from `userId` rather than from the name beside it. Two cooks who
   * happen to share a name are two people, and drawing them one face would say otherwise.
   */
  test("gives two chefs with the same name different seeds", async () => {
    const one = await seedRecipe();
    const other = await seedRecipe();

    const [first, second] = await t.run(async (ctx) => [
      await loadRecipe(ctx, { recipe: one, locale: "en" }),
      await loadRecipe(ctx, { recipe: other, locale: "en" }),
    ]);

    expect(first.chef?.name).toBe(second.chef?.name);
    expect(first.chef?.seed).not.toBe(second.chef?.seed);
  });

  /**
   * The page a recipe was imported from goes to its owner and to an admin, and to nobody else: the
   * field is left out of the payload, not drawn hidden, so a cook cannot read it off the wire.
   */
  describe("the source page", () => {
    const SOURCE = "https://example.com/onion-soup";

    /** A recipe imported from `SOURCE`, its owner, and a cook who did not write it. */
    const seedSourced = async () => {
      const recipeId = await seedRecipe();
      const { ownerId, strangerId } = await t.run(async (ctx) => {
        await ctx.db.patch(recipeId, { sourceUrl: SOURCE });
        return { ownerId: (await ctx.db.get(recipeId))!.userId!, strangerId: await ctx.db.insert("users", { name: "Léa" }) };
      });

      return { recipeId, ownerId, strangerId };
    };

    const load = (recipeId: Id<"recipes">, viewer?: { id: Id<"users">; isAdmin: boolean }) =>
      t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en", viewer }));

    test("gives the source to the cook who owns the recipe", async () => {
      const { recipeId, ownerId } = await seedSourced();

      expect((await load(recipeId, { id: ownerId, isAdmin: false })).sourceUrl).toBe(SOURCE);
    });

    test("gives the source to an admin reading a recipe they do not own", async () => {
      const { recipeId, strangerId } = await seedSourced();

      expect((await load(recipeId, { id: strangerId, isAdmin: true })).sourceUrl).toBe(SOURCE);
    });

    test("leaves the source out for any other cook", async () => {
      const { recipeId, strangerId } = await seedSourced();

      expect(await load(recipeId, { id: strangerId, isAdmin: false })).not.toHaveProperty("sourceUrl");
    });

    /** Nobody in particular is reading, so there is nobody it could be for. `getOne._internal` adds its own. */
    test("leaves the source out when no viewer is given", async () => {
      const { recipeId } = await seedSourced();

      expect(await load(recipeId)).not.toHaveProperty("sourceUrl");
    });

    test("ships no source for a recipe that has none, even to its owner", async () => {
      const recipeId = await seedRecipe();
      const ownerId = await t.run(async (ctx) => (await ctx.db.get(recipeId))!.userId!);

      expect(await load(recipeId, { id: ownerId, isAdmin: true })).not.toHaveProperty("sourceUrl");
    });
  });
});
