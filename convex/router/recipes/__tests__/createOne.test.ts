import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { api, internal } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

let t: ReturnType<typeof convexTest>;

const FREE_TEXT = {
  locale: "fr" as const,
  servings: 4,
  ingredients: "2 oignons\n2 cs d'huile d'olive",
  instructions: "Émincer les oignons, les faire suer, servir.",
};

const RECIPE = {
  title: "Soupe à l'oignon",
  description: "Une soupe d'hiver.",
  servings: 4,
  difficulty: 2 as const,
  cuisine: "french" as const,
  tags: ["soup" as const],
  equipments: [],
  timings: { preparation: 15 },
  instructions: [{ title: "Base", steps: ["Émincer les oignons."] }],
  ingredients: [{ name: "oignon", quantity: 2, unit: "pcs" as const }],
};

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("router/recipes/createOne", () => {
  /**
   * The gate, and the only assertion this file can make about `authed` without a model in the
   * loop: the rejection has to happen in the procedure wrapper, before a single token is spent.
   */
  test("rejects an unauthenticated caller", async () => {
    await expect(t.action(api.router.recipes.createOne.authed, FREE_TEXT)).rejects.toThrow();
  });

  test("rejects an authenticated caller who is not a known user", async () => {
    const ghost = await t.run((ctx) => ctx.db.insert("users", { name: "Ghost" }));
    await t.run((ctx) => ctx.db.delete(ghost));

    await expect(
      t.withIdentity(asUser(ghost)).action(api.router.recipes.createOne.authed, FREE_TEXT),
    ).rejects.toThrow();
  });

  test("_internal_persist stores the recipe against the owner it was handed", async () => {
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Franck" }));

    const recipeId = await t.mutation(internal.router.recipes.createOne._internal_persist, {
      userId,
      locale: "fr",
      recipe: RECIPE,
    });

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.userId).toBe(userId);
    expect(row!.title.values.fr).toBe("Soupe à l'oignon");
  });
});
