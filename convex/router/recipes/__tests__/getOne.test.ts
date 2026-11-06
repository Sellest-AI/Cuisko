import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";

import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * Imports the module under test before any test is timed, so the first one is not billed for the
 * backend graph beneath it against Vitest's 5s timeout. See router/ingredients/__tests__/resolve.test.ts
 * for the measurement. Stops at the `.` so a `"use node"` sibling stays out.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/recipes/getOne."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

let t: ReturnType<typeof convexTest>;

const seedUser = (name: string, role: "USER" | "ADMIN" = "USER") =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role, updatedAt: Date.now() });

    return userId;
  });

/** `userId` optional so a catalog recipe — one nobody wrote — can be seeded the same way. */
const seedRecipe = (userId?: Id<"users">) =>
  t.run((ctx) =>
    insertTestRecipe(ctx.db, {
      title: { values: { en: "Onion soup", fr: "Soupe à l'oignon" }, meta: {} },
      description: { values: { en: "A winter soup.", fr: "Une soupe d'hiver." }, meta: {} },
      instructions: {
        values: {
          en: "Base\n- Slice the onions.\n> A mandoline is faster.\n> Keep your fingers clear.\n- Sweat them.",
          fr: "Base\n- Émincer.",
        },
        meta: {},
      },
      servings: 4,
      equipments: ["oven"],
      difficulty: 2,
      userId,
      tags: ["soup"],
      timings: { preparation: 15, cooking: 30 },
      search: { en: "onion", fr: "oignon" },
      isVegetarian: true,
      isGlutenFree: true,
      isNutFree: true,
    }),
  );

/** Two lines, inserted out of order, so `position` is the only thing that can put them right. */
const seedLines = (recipeId: Id<"recipes">) =>
  t.run(async (ctx) => {
    const onionId = await ctx.db.insert("ingredients", {
      name: { values: { en: "Onion", fr: "Oignon" }, meta: {} },
      category: "VEGETABLE",
      emoji: "🧅",
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 40, protein: 1, fat: 0, carbohydrates: 9 },
      updatedAt: Date.now(),
    });
    const butterId = await ctx.db.insert("ingredients", {
      name: { values: { en: "Butter", fr: "Beurre" }, meta: {} },
      category: "DAIRY",
      emoji: "🧈",
      defaultUnit: "g",
      defaultQuantity: 10,
      nutrition: { calories: 717, protein: 1, fat: 81, carbohydrates: 0 },
      updatedAt: Date.now(),
    });

    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId: butterId,
      position: 1,
      quantity: 30,
      unit: "g",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId: onionId,
      position: 0,
      quantity: 4,
      unit: "pcs",
      updatedAt: Date.now(),
    });
  });

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("router/recipes/getOne", () => {
  test("rejects an unauthenticated caller", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(
      t.query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" }),
    ).rejects.toThrow();
  });

  /**
   * The INVERSE of the test that used to sit here. Until ADR 0014 this refused a stranger's recipe
   * by id; now a recipe is readable by any signed-in cook, because that is what sharing a link
   * means. What a stranger cannot do is edit it (`updateOne`'s test) or find it in their own list
   * (`getAll`'s and `search`'s). This pins the read as open on purpose, so a reader who assumes an
   * open read must be an IDOR does not "fix" it.
   */
  test("gives another cook's recipe to any signed-in caller", async () => {
    const ownerId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    const recipeId = await seedRecipe(ownerId);

    const recipe = await t
      .withIdentity(asUser(strangerId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });

    expect(recipe.title).toBe("Onion soup");
  });

  /** Archiving takes a recipe off every list, not out of reach: a meal cooked with it still opens it. */
  test("still gives an archived recipe", async () => {
    const ownerId = await seedUser("Franck");
    const recipeId = await seedRecipe(ownerId);
    await t.run((ctx) => ctx.db.patch(recipeId, { isArchived: true }));

    const recipe = await t
      .withIdentity(asUser(ownerId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });

    expect(recipe).toMatchObject({ title: "Onion soup", isArchived: true });
  });

  /** The planning review links to catalog recipes; a read that refused them landed on "not found". */
  test("gives a catalog recipe, which nobody owns", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe();

    const recipe = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });

    expect(recipe.title).toBe("Onion soup");
    expect(recipe.isOwned).toBe(false);
  });

  test("reports a missing recipe rather than answering with nothing", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);
    await t.run((ctx) => ctx.db.delete(recipeId));

    await expect(
      t
        .withIdentity(asUser(userId))
        .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" }),
    ).rejects.toThrow();
  });

  /** What the screen gates the pencil and the editor on, now that the read itself does not. */
  test("says whether the caller wrote it", async () => {
    const ownerId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    const recipeId = await seedRecipe(ownerId);

    const asOwner = await t
      .withIdentity(asUser(ownerId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });
    const asStranger = await t
      .withIdentity(asUser(strangerId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });

    expect(asOwner.isOwned).toBe(true);
    expect(asStranger.isOwned).toBe(false);
  });

  test("says whether the caller kept it, and only the caller", async () => {
    const userId = await seedUser("Franck");
    const otherId = await seedUser("Other");
    const recipeId = await seedRecipe(userId);

    const before = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });
    expect(before.isFavorited).toBe(false);

    await t.run((ctx) => ctx.db.insert("recipeFavorites", { userId, recipeId }));

    const after = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });
    expect(after.isFavorited).toBe(true);

    /** Somebody else's favorite is not the caller's — the flag is per reader, never per recipe. */
    const asOther = await t
      .withIdentity(asUser(otherId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });
    expect(asOther.isFavorited).toBe(false);
  });

  test("gives the owner their recipe", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    const recipe = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });

    expect(recipe.title).toBe("Onion soup");
    expect(recipe.description).toBe("A winter soup.");
    expect(recipe.servings).toBe(4);
    expect(recipe.difficulty).toBe(2);
    expect(recipe.cuisine).toBe("french");
    expect(recipe.tags).toEqual(["soup"]);
    expect(recipe.equipments).toEqual(["oven"]);
    /** The card's rule, inherited rather than restated: the three timings arrive as one number. */
    expect(recipe.minutes).toBe(45);
  });

  test("answers in the locale it was asked in", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    const recipe = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "fr" });

    expect(recipe.title).toBe("Soupe à l'oignon");
    expect(recipe.description).toBe("Une soupe d'hiver.");
  });

  /** The stored text is a serialized form; a page needs the groups, not the blob. */
  test("hands back parsed instruction groups rather than the stored text", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    const recipe = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });

    expect(recipe.instructions).toEqual([
      {
        title: "Base",
        steps: [
          { instruction: "Slice the onions.", hints: ["A mandoline is faster.", "Keep your fingers clear."] },
          { instruction: "Sweat them.", hints: [] },
        ],
      },
    ]);
  });

  test("names each line in the caller's locale, in the recipe's own order", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);
    await seedLines(recipeId);

    const caller = t.withIdentity(asUser(userId));

    const english = await caller.query(api.router.recipes.getOne.authed, {
      id: recipeId,
      locale: "en",
    });

    /**
     * Naming and ordering only. The glyph and the category each line also carries are
     * `loadRecipe`'s to get right, and are pinned in its own tests rather than here — this asserts
     * what the ROUTER promises, which is that the caller's locale reaches the lines and that the
     * recipe's own order survives the round trip.
     */
    expect(english.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit }))).toEqual([
      { name: "Onion", quantity: 4, unit: "pcs" },
      { name: "Butter", quantity: 30, unit: "g" },
    ]);

    const french = await caller.query(api.router.recipes.getOne.authed, {
      id: recipeId,
      locale: "fr",
    });

    expect(french.ingredients.map((line) => line.name)).toEqual(["Oignon", "Beurre"]);
  });

  /**
   * The blob is for the index, not for anyone downstream — several kilobytes of it per recipe. And
   * `userId` matters more now that strangers read: the payload says whether the reader owns the
   * recipe, never who does.
   */
  test("does not ship the search blob, nor the owner's id", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    const recipe = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });

    expect(recipe).not.toHaveProperty("search");
    expect(recipe).not.toHaveProperty("userId");
  });

  /**
   * The source page rides `authed` for its owner and for an admin only. The rule is
   * `loadRecipe`'s and is tested there; this pins that the role actually reaches it.
   */
  describe("the source page", () => {
    const SOURCE = "https://example.com/onion-soup";

    const seedSourced = async (ownerId: Id<"users">) => {
      const recipeId = await seedRecipe(ownerId);
      await t.run((ctx) => ctx.db.patch(recipeId, { sourceUrl: SOURCE }));

      return recipeId;
    };

    const readAs = (userId: Id<"users">, recipeId: Id<"recipes">) =>
      t.withIdentity(asUser(userId)).query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });

    test("gives the source to the recipe's owner", async () => {
      const ownerId = await seedUser("Franck");

      expect((await readAs(ownerId, await seedSourced(ownerId))).sourceUrl).toBe(SOURCE);
    });

    test("gives the source to an admin on another cook's recipe", async () => {
      const recipeId = await seedSourced(await seedUser("Franck"));
      const adminId = await seedUser("Admin", "ADMIN");

      expect((await readAs(adminId, recipeId)).sourceUrl).toBe(SOURCE);
    });

    test("withholds the source from another cook", async () => {
      const recipeId = await seedSourced(await seedUser("Franck"));

      expect(await readAs(await seedUser("Stranger"), recipeId)).not.toHaveProperty("sourceUrl");
    });
  });

  /**
   * What the showcase website reads to preview a shared link. The id arrives from a URL, so a
   * malformed one is ordinary, and must fail the same way an unknown one does.
   */
  describe("server", () => {
    /** Matches the placeholder in vitest.config.mts — the same value `serverQuery` compares against. */
    const SERVER_KEY = "test-server-private-key-0123456789abcdef";

    /** `large` is the original image row: no rendition sits above it on the ladder. */
    const seedCover = (recipeId: Id<"recipes">) =>
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
        await ctx.db.patch(recipeId, { coverImageId });
      });

    test("rejects a wrong server key", async () => {
      const recipeId = await seedRecipe(await seedUser("Franck"));

      await expect(
        t.query(api.router.recipes.getOne.server, { _serverKey: "not-the-key", id: recipeId }),
      ).rejects.toThrow(/FORBIDDEN/);
    });

    test("gives the title in the asked locale and the large cover", async () => {
      const recipeId = await seedRecipe(await seedUser("Franck"));
      await seedCover(recipeId);

      const recipe = await t.query(api.router.recipes.getOne.server, {
        _serverKey: SERVER_KEY,
        id: recipeId,
        locale: "fr",
      });

      expect(recipe.title).toBe("Soupe à l'oignon");
      expect(recipe.coverImageLargeUrl).toBe("cover.webp");
    });

    test("answers in English when no locale is given", async () => {
      const recipeId = await seedRecipe(await seedUser("Franck"));

      const recipe = await t.query(api.router.recipes.getOne.server, { _serverKey: SERVER_KEY, id: recipeId });

      expect(recipe.title).toBe("Onion soup");
    });

    test("leaves the cover absent for a recipe that has none", async () => {
      const recipeId = await seedRecipe(await seedUser("Franck"));

      const recipe = await t.query(api.router.recipes.getOne.server, { _serverKey: SERVER_KEY, id: recipeId });

      expect(recipe.coverImageLargeUrl).toBeUndefined();
    });

    test("still gives an archived recipe", async () => {
      const recipeId = await seedRecipe(await seedUser("Franck"));
      await t.run((ctx) => ctx.db.patch(recipeId, { isArchived: true }));

      const recipe = await t.query(api.router.recipes.getOne.server, { _serverKey: SERVER_KEY, id: recipeId });

      expect(recipe.title).toBe("Onion soup");
    });

    test("reports a malformed id as NOT_FOUND, not as a validation error", async () => {
      await expect(
        t.query(api.router.recipes.getOne.server, { _serverKey: SERVER_KEY, id: "hello" }),
      ).rejects.toThrow(/NOT_FOUND/);
    });

    test("reports an unknown id as NOT_FOUND", async () => {
      const recipeId = await seedRecipe(await seedUser("Franck"));
      await t.run((ctx) => ctx.db.delete(recipeId));

      await expect(
        t.query(api.router.recipes.getOne.server, { _serverKey: SERVER_KEY, id: recipeId }),
      ).rejects.toThrow(/NOT_FOUND/);
    });

    /** Nobody in particular is reading, and the website must have nothing about the author to leak. */
    test("ships no owner id, no viewer flags and no source page", async () => {
      const recipeId = await seedRecipe(await seedUser("Franck"));
      await t.run((ctx) => ctx.db.patch(recipeId, { sourceUrl: "https://example.com/onion-soup" }));

      const recipe = await t.query(api.router.recipes.getOne.server, { _serverKey: SERVER_KEY, id: recipeId });

      expect(recipe).not.toHaveProperty("userId");
      expect(recipe).not.toHaveProperty("isOwned");
      expect(recipe).not.toHaveProperty("isFavorited");
      expect(recipe).not.toHaveProperty("sourceUrl");
    });
  });

  /**
   * `_internal` deliberately does NOT check ownership — see the ⚠️ on the export, and ADR 0003
   * §"Actions". These pin that as intended behaviour rather than an oversight: a reader who assumes
   * an unchecked internal read must be a bug would otherwise "fix" it and break every system job
   * that reads a recipe nobody asked for.
   *
   * Ownership for the one caller that does act for a cook is `updateOne`'s, and is tested there.
   */
  describe("_internal", () => {
    test("reads a recipe without asking who is calling", async () => {
      const ownerId = await seedUser("Franck");
      const recipeId = await seedRecipe(ownerId);

      const recipe = await t.query(internal.router.recipes.getOne._internal, {
        id: recipeId,
        locale: "en",
      });

      expect(recipe.title).toBe("Onion soup");
    });

    /** The one field `authed` withholds, and the reason a caller acting for a cook can compare it. */
    test("carries the userId the client-facing export withholds, and no viewer flags", async () => {
      const ownerId = await seedUser("Franck");
      const recipeId = await seedRecipe(ownerId);

      const recipe = await t.query(internal.router.recipes.getOne._internal, {
        id: recipeId,
        locale: "en",
      });

      expect(recipe.userId).toBe(ownerId);
      /** Nobody in particular is reading, so there is nobody the flags could be about. */
      expect(recipe).not.toHaveProperty("isOwned");
      expect(recipe).not.toHaveProperty("isFavorited");
    });

    test("reports a missing recipe rather than answering with nothing", async () => {
      const userId = await seedUser("Franck");
      const recipeId = await seedRecipe(userId);
      await t.run((ctx) => ctx.db.delete(recipeId));

      await expect(
        t.query(internal.router.recipes.getOne._internal, { id: recipeId, locale: "en" }),
      ).rejects.toThrow();
    });
  });
});
