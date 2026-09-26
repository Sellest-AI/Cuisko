import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { parseInstructions, serializeInstructions } from "../../../../shared/recipes";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

/**
 * The one call `updateOne` can spend a token on, mocked so a test can assert on WHETHER it ran
 * without waiting on — or paying for — a real model. `sanitizeRecipe.run`'s actual behaviour is
 * `sanitizeRecipe`'s own test's job; this file only needs to know it was, or was not, reached.
 */
const sanitizeRun = vi.hoisted(() => vi.fn());

vi.mock("@convex/agent/tools/sanitizeRecipe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../agent/tools/sanitizeRecipe")>();
  return { ...actual, sanitizeRecipe: { run: sanitizeRun } };
});

/**
 * The other call this path spends money on, mocked for the same reason as the agent above: a
 * resolve reaches two live APIs and can call a model per name, and no test may buy either.
 *
 * Nothing here asserts on it — what it is asked and what it answers belong to
 * `regenerateRecipe.test.ts` and `resolveRecipeIngredients.test.ts`. It is stubbed so that
 * exercising `authed` end to end stays free.
 */
const resolveRun = vi.hoisted(() => vi.fn());

vi.mock("@convex/functions/recipes/resolveRecipeIngredients", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../functions/recipes/resolveRecipeIngredients")>();
  return { ...actual, resolveRecipeIngredients: resolveRun };
});

let t: ReturnType<typeof convexTest>;

const seedUser = (name: string) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });

    return userId;
  });

/** The stored text, and the free text that round-trips back to exactly this — see the tests below. */
const SEED_INSTRUCTIONS = "Base\n- Émincer les oignons.\n> Une mandoline va plus vite.";
const UNCHANGED_INSTRUCTIONS = serializeInstructions(parseInstructions(SEED_INSTRUCTIONS));

const seedRecipe = (userId: Id<"users">, sourceUrl?: string) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      sourceUrl,
      title: { values: { fr: "Soupe à l'oignon" }, meta: {} },
      description: { values: { fr: "Une soupe d'hiver." }, meta: {} },
      instructions: { values: { fr: SEED_INSTRUCTIONS }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 2,
      userId,
      tags: ["soup"],
      cuisine: "french",
      timings: { preparation: 15 },
      search: { fr: "oignon" },
      isVegan: false,
      isVegetarian: true,
      isPescatarian: false,
      isGlutenFree: true,
      isDairyFree: false,
      isNutFree: true,
      updatedAt: Date.now(),
    }),
  );

/** Changes nothing against `seedRecipe` — no ingredient rows are seeded, so `""` is "unchanged" too. */
const UNCHANGED = {
  locale: "fr" as const,
  title: "Soupe à l'oignon",
  description: "Une soupe d'hiver.",
  servings: 4,
  ingredients: "",
  instructions: UNCHANGED_INSTRUCTIONS,
  tags: ["soup" as const],
  equipments: [],
  difficulty: 2 as const,
  cuisine: "french" as const,
  timings: { preparation: 15 },
};

/**
 * The five fields the cook sets by hand, every value distinct from both `seedRecipe` and `RECIPE`
 * (what the mocked agent answers) — so an assertion on any of them can only pass if the cook won.
 */
const HAND_SET = {
  tags: ["starter" as const, "comfort-food" as const],
  equipments: ["blender" as const],
  difficulty: 4 as const,
  cuisine: "japanese" as const,
  timings: { cooking: 90, resting: 20 },
};

const RECIPE = {
  title: "Soupe à l'oignon, revisitée",
  description: "Une soupe d'hiver, en mieux.",
  servings: 4,
  difficulty: 2 as const,
  cuisine: "french" as const,
  tags: ["soup" as const],
  equipments: [],
  timings: { preparation: 15 },
  instructions: [
    { title: "Base", steps: [{ instruction: "Émincer 2 oignons.", hints: ["Une mandoline va plus vite."] }] },
  ],
  ingredients: [{ name: "oignon", quantity: 2, unit: "pcs" as const }],
};

/**
 * The module graph this file exercises, imported before anything is timed — the same narrow warm-up
 * `router/ingredients/__tests__/resolve.test.ts` documents at length, for the same reason.
 *
 * `import.meta.glob` hands convex-test LAZY loaders, so the graph is instantiated on the first call
 * that needs it and billed to whichever test made that call — here the authorization rejection at
 * the top, whose own subject should cost microseconds. This slice added three modules to that graph
 * and pushed the first test to ~5s against Vitest's default timeout.
 *
 * Narrow on purpose: warming the whole glob measures four times slower, because every file that
 * globs `convex/` would then import the entire backend rather than the part it uses.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/recipes/updateOne."))
      .map(([, load]) => load()),
  ),
);

/**
 * A change to the text schedules the translation with `runAfter(0)`, which nothing here asserts
 * on. The timers are faked so it never fires against an instance that is already gone — the
 * reason is spelled out in `createOne.test.ts`, which shares the shape.
 */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  t = convexTest(schema, modules);
  sanitizeRun.mockReset();
  sanitizeRun.mockResolvedValue(RECIPE);
  resolveRun.mockReset();
  resolveRun.mockResolvedValue({ links: [], complete: true });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("router/recipes/updateOne", () => {
  /**
   * The gate, and the only assertion this file can make about `authed` without a model in the
   * loop: the rejection has to happen before a single token is spent — same guarantee as
   * `createOne`, on the same builder.
   */
  test("rejects an unauthenticated caller", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(
      t.action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId }),
    ).rejects.toThrow();

    expect(sanitizeRun).not.toHaveBeenCalled();
  });

  /**
   * The check this file exists to add over `createOne`'s: a stranger's `recipeId` is refused
   * before their free text ever reaches the agent, and the row is left exactly as it was.
   */
  test("refuses to revise a recipe the caller does not own", async () => {
    const ownerId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    const recipeId = await seedRecipe(ownerId);

    await expect(
      t
        .withIdentity(asUser(strangerId))
        .action(api.router.recipes.updateOne.authed, {
          ...UNCHANGED,
          recipeId,
          title: "Stolen",
        }),
    ).rejects.toThrow();

    expect(sanitizeRun).not.toHaveBeenCalled();

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.values.fr).toBe("Soupe à l'oignon");
  });

  test("rejects a blank title", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(
      t
        .withIdentity(asUser(userId))
        .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, title: "   " }),
    ).rejects.toThrow();
  });

  test("rejects a blank description", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(
      t
        .withIdentity(asUser(userId))
        .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, description: "" }),
    ).rejects.toThrow();
  });

  /**
   * The wiring, end to end, and deliberately not the decision: WHETHER the agent runs is
   * `regenerateRecipe`'s call and is asserted in its own test. What only this file can see is that
   * the answer reaches the persist — `analyzed` decides whether the row records the text as the
   * machine's or as the cook's own, and a router that dropped it on the floor would still pass
   * every test on either side of it.
   */
  test("stores an edit the agent never saw as the cook's own words", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, title: "Nouveau titre" });

    expect(sanitizeRun).not.toHaveBeenCalled();

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.values.fr).toBe("Nouveau titre");
    expect(row!.title.meta.fr!.status).toBe("edited");
  });

  test("stores an edit the agent did revise as machine text", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, ingredients: "2 oignons" });

    expect(sanitizeRun).toHaveBeenCalledTimes(1);

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.meta.fr!.status).toBe("machine");
    // The agent's hint reaches the column under the step it belongs to.
    expect(row!.instructions.values.fr).toContain("- Émincer 2 oignons.\n> Une mandoline va plus vite.");
  });

  /**
   * The cook rewords their hint and adds a second one. No agent — a hint is their own aside — and
   * the row holds exactly what they wrote, under the step they wrote it under.
   */
  test("stores a hint-only edit as the cook wrote it, without calling the agent", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);
    const instructions = "## Base\n- Émincer les oignons.\n> Une mandoline, c'est deux fois plus rapide.\n> Gardez les doigts loin de la lame.";

    await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, instructions });

    expect(sanitizeRun).not.toHaveBeenCalled();

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.instructions.values.fr).toBe(instructions);
    expect(row!.instructions.meta.fr!.status).toBe("edited");
  });

  test("_internal_persist patches the row it is handed rather than inserting a new one", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    const returned = await t.mutation(internal.router.recipes.updateOne._internal_persist, {
      recipeId,
      locale: "fr",
      recipe: RECIPE,
      analyzed: true,
      links: [],
      complete: true,
    });

    expect(returned).toBe(recipeId);

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.values.fr).toBe("Soupe à l'oignon, revisitée");

    const rows = await t.run((ctx) => ctx.db.query("recipes").collect());
    expect(rows).toHaveLength(1);
  });

  /**
   * The round trip that has to survive: `updateOne` does not accept `sourceUrl` on purpose — a
   * cook cannot set or clear where a recipe came from — so an edit must leave the stored one
   * exactly as it was. `updateRecipe` patches an explicit field list; this pins that it stays so.
   */
  test("preserves the row's sourceUrl across an edit", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId, "https://example.com/soupe");

    await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, ingredients: "2 oignons" });

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.sourceUrl).toBe("https://example.com/soupe");
  });

  /**
   * The slice's promise: correcting what the agent guessed costs no model call. None of the five is
   * an ingredient and all five are locale-free, so the row takes them as they are.
   */
  test("writes an edit touching only the hand-set fields without calling the agent", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, ...HAND_SET });

    expect(sanitizeRun).not.toHaveBeenCalled();

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row).toMatchObject({
      equipments: HAND_SET.equipments,
      difficulty: HAND_SET.difficulty,
      cuisine: HAND_SET.cuisine,
      timings: HAND_SET.timings,
    });
    expect(row!.tags).toEqual(expect.arrayContaining(HAND_SET.tags));
    expect(row!.tags).not.toContain("soup");
    expect(row!.title.meta.fr!.status).toBe("edited");
  });

  /** A tag the cook set survives the agent rerunning in the same save — `reviseRecipe` re-forces it. */
  test("keeps the cook's hand-set fields over the agent's when the ingredients changed too", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.updateOne.authed, {
        ...UNCHANGED,
        recipeId,
        ...HAND_SET,
        ingredients: "2 oignons",
      });

    expect(sanitizeRun).toHaveBeenCalledTimes(1);

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.values.fr).toBe(RECIPE.title);
    expect(row).toMatchObject({
      equipments: HAND_SET.equipments,
      difficulty: HAND_SET.difficulty,
      cuisine: HAND_SET.cuisine,
      timings: HAND_SET.timings,
    });
    expect(row!.tags).toEqual(expect.arrayContaining(HAND_SET.tags));
  });

  /**
   * Rule 1 of the slice, and the only thing standing under it: the overlay changes nothing but a
   * prompt string, so if it broke the model would simply get worse context and no other test would
   * notice. The model must be told the recipe as the cook now states it, not as it was stored.
   */
  test("hands the model the cook's hand-set fields as the recipe as it stands", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.updateOne.authed, {
        ...UNCHANGED,
        recipeId,
        ...HAND_SET,
        ingredients: "2 oignons",
      });

    const { outdated } = sanitizeRun.mock.calls[0]![1] as { outdated: Record<string, unknown> };
    expect(outdated).toMatchObject(HAND_SET);
  });

  /**
   * The ordering the overlay depends on: `recipeChangesOf` compares the edit against the STORED
   * row, and the overlay is applied only afterwards. Overlay first and the edit would compare equal
   * to itself — the agent would never run again, whatever the cook rewrote.
   */
  test("still reaches the agent when an ingredient edit carries hand-set fields", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await t
      .withIdentity(asUser(userId))
      .action(api.router.recipes.updateOne.authed, {
        ...UNCHANGED,
        recipeId,
        ...HAND_SET,
        ingredients: "3 oignons",
      });

    expect(sanitizeRun).toHaveBeenCalledTimes(1);
  });

  /** Computed tags fall out of the ingredients; `vRecipeEdit.tags` is `AUTHORED_TAGS` so no client can set one. */
  test("rejects a computed tag sent by a client", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(
      t.withIdentity(asUser(userId)).action(api.router.recipes.updateOne.authed, {
        ...UNCHANGED,
        recipeId,
        // @ts-expect-error — the point of the test: the validator refuses what the type already does.
        tags: ["gluten-free"],
      }),
    ).rejects.toThrow();

    expect(sanitizeRun).not.toHaveBeenCalled();
  });

  /** `v.number()` alone would store these, and they are summed into what the planner filters on. */
  test.each([
    { preparation: -5 },
    { cooking: 0 },
    { cooking: 7 * 24 * 60 + 1 },
  ])("rejects a timing its own editor could never produce: %j", async (timings) => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(
      t
        .withIdentity(asUser(userId))
        .action(api.router.recipes.updateOne.authed, { ...UNCHANGED, recipeId, timings }),
    ).rejects.toThrow();

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.timings).toEqual({ preparation: 15 });
  });

  /**
   * A row the agent timed as `7.5` before its answer was rounded: the editor sends that value back
   * untouched on every save, so refusing it would lock the cook out of editing the title.
   */
  test("saves an edit carrying a fractional timing from the stored row, rounded", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);
    await t.run((ctx) => ctx.db.patch(recipeId, { timings: { preparation: 7.5 } }));

    await t.withIdentity(asUser(userId)).action(api.router.recipes.updateOne.authed, {
      ...UNCHANGED,
      recipeId,
      title: "Soupe à l'oignon gratinée",
      timings: { preparation: 7.5 },
    });

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.values.fr).toBe("Soupe à l'oignon gratinée");
    expect(row!.timings).toEqual({ preparation: 8 });
  });
});
