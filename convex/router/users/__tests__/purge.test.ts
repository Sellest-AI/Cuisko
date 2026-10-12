import agentTest, { register as registerAgent } from "@convex-dev/agent/test";
import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { assistantAgent } from "../../../agent/agents";
import { api, components, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { REVIEW_ACCOUNT } from "../../../functions/auth/reviewAccount";
import { loadUser } from "../../../functions/users/loadUser";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * Imports the modules under test before any test is timed — see getMe.test.ts. The agent component
 * is a second lazy glob and is warmed too: the purge deletes threads through it (see listMessages.test.ts).
 */
beforeAll(() =>
  Promise.all([
    ...Object.entries(modules)
      .filter(([path]) => /^\/convex\/router\/users\/(purge|requestDeletion)\./.test(path))
      .map(([, load]) => load()),
    ...Object.values(agentTest.modules).map((load) => load()),
  ]),
);

/** What each test reports to analytics: the client is mocked, so nothing is sent or scheduled. */
const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));
/** The account events captured, as `[event, properties]`. */
const accountEvents = () =>
  capture.mock.calls.map(([, { event, properties }]) => [event, properties] as [string, Record<string, unknown>]);
beforeEach(() => capture.mockReset());
afterEach(() => vi.useRealTimers());

/** The purge deletes conversations, which live in the agent component, so every deployment has it. */
const newDeployment = () => {
  const t = convexTest(schema, modules);
  registerAgent(t);
  return t;
};
type TestConvex = ReturnType<typeof newDeployment>;

const DAY = 24 * 60 * 60 * 1000;

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

/**
 * A cook as the purge finds one: signed up with a photo-free profile, in one household of their own,
 * with a deletion due (or not, or later) as `deletionDueAt` says.
 */
const seedCook = (t: TestConvex, { email, deletionDueAt }: { email: string; deletionDueAt?: number }) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Franck",
      email,
      image: "https://example.com/franck.jpg",
      emailVerificationTime: 1,
    });
    const householdId = await ctx.db.insert("households", {
      name: "Chez Franck",
      inviteCode: email.slice(0, 6).toUpperCase(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("householdUsers", { householdId, userId });
    await ctx.db.insert("usersExtended", {
      userId,
      role: "USER",
      currentHouseholdId: householdId,
      deletionDueAt,
      updatedAt: Date.now(),
    });
    return { userId, householdId };
  });

/**
 * What @convex-dev/auth would hold after a password sign-up: an account with a pending code, a session
 * with a refresh token, and a failed-attempt counter keyed by the address.
 */
const seedSignIns = (t: TestConvex, userId: Id<"users">, email: string) =>
  t.run(async (ctx) => {
    const accountId = await ctx.db.insert("authAccounts", {
      userId,
      provider: "password",
      providerAccountId: email,
    });
    await ctx.db.insert("authVerificationCodes", {
      accountId,
      provider: "password",
      code: `code-${email}`,
      expirationTime: Date.now() + DAY,
    });
    const sessionId = await ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + DAY });
    await ctx.db.insert("authRefreshTokens", { sessionId, expirationTime: Date.now() + DAY });
    await ctx.db.insert("authRateLimits", { identifier: email, lastAttemptTime: Date.now(), attemptsLeft: 4 });
    return { accountId, sessionId };
  });

/** Every sign-in row reachable from the person: by id, by address, or through their account or session. */
const signInsOf = (
  t: TestConvex,
  userId: Id<"users">,
  email: string,
  { accountId, sessionId }: Awaited<ReturnType<typeof seedSignIns>>,
) =>
  t.run(async (ctx) => ({
    accounts: await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).collect(),
    byAddress: await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", email))
      .first(),
    codes: await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", accountId)).collect(),
    sessions: await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
    tokens: await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", sessionId)).collect(),
    attempts: await ctx.db.query("authRateLimits").withIndex("identifier", (q) => q.eq("identifier", email)).collect(),
  }));

/** A conversation with one message in it, as the assistant opens one. */
const seedThread = async (t: TestConvex, userId: Id<"users">) => {
  const { threadId } = await t.run((ctx) => assistantAgent.createThread(ctx, { userId }));
  await t.run((ctx) =>
    assistantAgent.saveMessage(ctx, { threadId, userId, prompt: "Que faire avec 3 oignons ?", skipEmbeddings: true }),
  );
  return threadId;
};

const threadOf = (t: TestConvex, threadId: string) =>
  t.run((ctx) => ctx.runQuery(components.agent.threads.getThread, { threadId }));

const insertIngredient = (t: TestConvex) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: "oignon", en: "onion" }, meta: {} },
      search: { fr: "oignon", en: "onion" },
      category: "OTHER",
      emoji: "🧅",
      diet: "vegan",
      allergens: [],
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    }),
  );

const insertRecipe = (t: TestConvex, userId: Id<"users">, isArchived = false) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      userId,
      status: "generated",
      isArchived,
      title: { values: { fr: "Soupe à l'oignon" }, meta: {} },
      description: { values: { fr: "Une soupe d'hiver." }, meta: {} },
      instructions: { values: { fr: "Base\n- Émincer les oignons." }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 2,
      tags: [],
      cuisine: "french",
      timings: { preparation: 15 },
      search: { en: "", fr: "" },
      isVegan: false,
      isVegetarian: true,
      isPescatarian: false,
      isGlutenFree: true,
      isDairyFree: false,
      isNutFree: true,
      updatedAt: Date.now(),
    }),
  );

const insertImage = (t: TestConvex) =>
  t.run((ctx) =>
    ctx.db.insert("images", {
      hasAlpha: false,
      key: "public/fridge.webp",
      url: "https://example.com/fridge.webp",
      width: 768,
      height: 512,
      size: 100_000,
      mimeType: "image/webp",
      tags: ["IMAGE"],
      updatedAt: Date.now(),
    }),
  );

/**
 * A cook with everything the purge has an opinion about: a solo kitchen with something in it, a
 * kitchen shared with a second cook, a recipe, a favorite, preferences, a photo, and a former
 * membership. The second cook is there to prove nothing of theirs is touched.
 */
const seedFullCook = async (t: TestConvex, deletionDueAt?: number) => {
  const cook = await seedCook(t, { email: "franck@example.com", deletionDueAt });
  const other = await seedCook(t, { email: "marie@example.com" });
  const ingredientId = await insertIngredient(t);
  const recipeId = await insertRecipe(t, cook.userId);
  const imageId = await insertImage(t);

  await t.run(async (ctx) => {
    await ctx.db.insert("householdUsers", { householdId: other.householdId, userId: cook.userId });
    await ctx.db.insert("cellarItems", {
      householdId: cook.householdId,
      ingredientId,
      unit: "pcs",
      quantity: 3,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("recipeFavorites", { recipeId, userId: cook.userId });
    await ctx.db.insert("userPreferences", {
      userId: cook.userId,
      diet: "vegetarian",
      avoids: [],
      seeks: [],
      updatedAt: Date.now(),
    });
    await ctx.db.insert("userImages", { userId: cook.userId, imageId });
    // A household both of them left long ago: one former-member row each.
    const formerId = await ctx.db.insert("households", { name: "Coloc", updatedAt: Date.now() });
    await ctx.db.insert("householdFormerMembers", { householdId: formerId, userId: cook.userId });
    await ctx.db.insert("householdFormerMembers", { householdId: formerId, userId: other.userId });
  });

  const cookSignIns = await seedSignIns(t, cook.userId, "franck@example.com");
  const otherSignIns = await seedSignIns(t, other.userId, "marie@example.com");

  return { cook, other, recipeId, imageId, cookSignIns, otherSignIns };
};

const purge = (t: TestConvex, userId: Id<"users">, force?: boolean) =>
  t.mutation(internal.router.users.purge._internal, { userId, force });

const extendedOf = (t: TestConvex, userId: Id<"users">) =>
  t.run((ctx) => ctx.db.query("usersExtended").withIndex("by_user", (q) => q.eq("userId", userId)).first());

const membershipsOf = (t: TestConvex, userId: Id<"users">) =>
  t.run((ctx) => ctx.db.query("householdUsers").withIndex("by_user", (q) => q.eq("userId", userId)).collect());

describe("router/users/purge", () => {
  test("does nothing to an account that never asked", async () => {
    const t = newDeployment();
    const { cook } = await seedFullCook(t);
    const before = await t.run((ctx) => ctx.db.get(cook.userId));

    expect(await purge(t, cook.userId)).toBe("skipped");
    expect(await t.run((ctx) => ctx.db.get(cook.userId))).toEqual(before);
  });

  /** A job left over from a request that was cancelled, then made again later, wakes up early. */
  test("does nothing while the date is still ahead", async () => {
    const t = newDeployment();
    const { cook } = await seedFullCook(t, Date.now() + DAY);

    expect(await purge(t, cook.userId)).toBe("skipped");
    expect((await extendedOf(t, cook.userId))?.deletedAt).toBeUndefined();
  });

  describe("analytics", () => {
    test("reports a due purge as deleted, anonymized", async () => {
      const t = newDeployment();
      const { cook } = await seedFullCook(t, Date.now() - 1);

      await purge(t, cook.userId);

      expect(accountEvents()).toEqual([["account deleted", { outcome: "anonymized", accountAgeDays: 0 }]]);
      expect(capture.mock.calls[0]![1].distinctId).toBe(cook.userId);
    });

    /** A bot or spammer removed by hand: counted, and told apart by `outcome`. */
    test("reports a forced erase as deleted, erased", async () => {
      const t = newDeployment();
      const { cook } = await seedFullCook(t);

      await purge(t, cook.userId, true);

      expect(accountEvents()).toEqual([["account deleted", { outcome: "erased", accountAgeDays: 0 }]]);
    });

    /** The purge clears the email before it reports, so the row it read first is what says who it was. */
    test("reports nothing when the purged account is the store reviewer's", async () => {
      const t = newDeployment();
      const { userId } = await seedCook(t, { email: REVIEW_ACCOUNT.email, deletionDueAt: Date.now() - 1 });

      expect(await purge(t, userId)).toBe("anonymized");
      expect(capture).not.toHaveBeenCalled();
    });

    test("reports nothing when the purge skips", async () => {
      const t = newDeployment();
      const { cook } = await seedFullCook(t, Date.now() + DAY);

      await purge(t, cook.userId);

      expect(capture).not.toHaveBeenCalled();
    });
  });

  describe("once due", () => {
    test("leaves a tombstone that names nobody and cannot act", async () => {
      const t = newDeployment();
      const { cook } = await seedFullCook(t, Date.now() - 1);

      expect(await purge(t, cook.userId)).toBe("anonymized");

      const user = await t.run((ctx) => ctx.db.get(cook.userId));
      expect(user).not.toBeNull();
      // A cleared field is an absent key, so each is checked on its own rather than matched.
      expect(user?.name).toBeUndefined();
      expect(user?.email).toBeUndefined();
      expect(user?.image).toBeUndefined();
      expect(user?.emailVerificationTime).toBeUndefined();

      const extended = await extendedOf(t, cook.userId);
      expect(extended?.deletedAt).toBeTypeOf("number");
      expect(extended?.deletionDueAt).toBeUndefined();
      expect(extended?.currentHouseholdId).toBeUndefined();
      expect(await t.run((ctx) => loadUser(ctx, cook.userId))).toBeNull();
    });

    /** The invariant, over the whole table rather than one row: the address is nowhere. */
    test("no user row anywhere still holds the address", async () => {
      const t = newDeployment();
      const { cook } = await seedFullCook(t, Date.now() - 1);

      await purge(t, cook.userId);

      const users = await t.run((ctx) => ctx.db.query("users").collect());
      expect(users.map((user) => user.email)).not.toContain("franck@example.com");
      expect(users.map((user) => user.email)).toContain("marie@example.com");
    });

    test("keeps the solo kitchen and what is in it, without its name or code", async () => {
      const t = newDeployment();
      const { cook } = await seedFullCook(t, Date.now() - 1);

      await purge(t, cook.userId);

      const household = await t.run((ctx) => ctx.db.get(cook.householdId));
      expect(household?.name).toBe("");
      expect(household?.inviteCode).toBeUndefined();

      const cellar = await t.run((ctx) =>
        ctx.db.query("cellarItems").withIndex("by_household", (q) => q.eq("householdId", cook.householdId)).collect(),
      );
      expect(cellar.map((item) => item.quantity)).toEqual([3]);

      // Its one membership stays, pointing at the tombstone: it is what ties the cellar to an id.
      expect((await membershipsOf(t, cook.userId)).map((m) => m.householdId)).toEqual([cook.householdId]);
    });

    test("leaves a shared kitchen as it was, without them in it", async () => {
      const t = newDeployment();
      const { cook, other } = await seedFullCook(t, Date.now() - 1);

      await purge(t, cook.userId);

      const shared = await t.run((ctx) => ctx.db.get(other.householdId));
      expect(shared).toMatchObject({ name: "Chez Franck", inviteCode: "MARIE@" });

      const members = await t.run((ctx) =>
        ctx.db.query("householdUsers").withIndex("by_household", (q) => q.eq("householdId", other.householdId)).collect(),
      );
      expect(members.map((m) => m.userId)).toEqual([other.userId]);
    });

    test("forgets their past households, not anyone else's", async () => {
      const t = newDeployment();
      const { cook, other } = await seedFullCook(t, Date.now() - 1);

      await purge(t, cook.userId);

      const formers = await t.run((ctx) => ctx.db.query("householdFormerMembers").collect());
      expect(formers.map((row) => row.userId)).toEqual([other.userId]);
    });

    test("keeps their recipes, favorites and preferences, still on the tombstone's id", async () => {
      const t = newDeployment();
      const { cook, recipeId } = await seedFullCook(t, Date.now() - 1);

      await purge(t, cook.userId);

      const kept = await t.run(async (ctx) => ({
        recipe: await ctx.db.get(recipeId),
        favorites: await ctx.db.query("recipeFavorites").withIndex("by_user", (q) => q.eq("userId", cook.userId)).collect(),
        preferences: await ctx.db.query("userPreferences").withIndex("by_user", (q) => q.eq("userId", cook.userId)).first(),
      }));
      expect(kept.recipe?.userId).toBe(cook.userId);
      expect(kept.favorites.map((f) => f.recipeId)).toEqual([recipeId]);
      expect(kept.preferences?.diet).toBe("vegetarian");
    });

    test("deletes their photos, and queues the files for removal", async () => {
      const t = newDeployment();
      const { cook, imageId } = await seedFullCook(t, Date.now() - 1);

      await purge(t, cook.userId);

      const photos = await t.run((ctx) =>
        ctx.db.query("userImages").withIndex("by_user_id", (q) => q.eq("userId", cook.userId)).collect(),
      );
      expect(photos).toEqual([]);

      const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
      expect(jobs).toContainEqual(
        expect.objectContaining({ name: "router/media/images/deleteOne:_internal", args: [{ imageId }] }),
      );
    });

    test("deletes every way to sign in as them, so the address is free again", async () => {
      const t = newDeployment();
      const { cook, cookSignIns } = await seedFullCook(t, Date.now() - 1);

      await purge(t, cook.userId);

      expect(await signInsOf(t, cook.userId, "franck@example.com", cookSignIns)).toEqual({
        accounts: [],
        byAddress: null,
        codes: [],
        sessions: [],
        tokens: [],
        attempts: [],
      });
    });

    test("leaves the other cook able to sign in", async () => {
      const t = newDeployment();
      const { cook, other, otherSignIns } = await seedFullCook(t, Date.now() - 1);

      await purge(t, cook.userId);

      const theirs = await signInsOf(t, other.userId, "marie@example.com", otherSignIns);
      expect(theirs.accounts).toHaveLength(1);
      expect(theirs.byAddress).not.toBeNull();
      expect(theirs.codes).toHaveLength(1);
      expect(theirs.sessions).toHaveLength(1);
      expect(theirs.tokens).toHaveLength(1);
      expect(theirs.attempts).toHaveLength(1);
    });

    test("deletes their conversations with the assistant, and nobody else's", async () => {
      vi.useFakeTimers();
      const t = newDeployment();
      const cook = await seedCook(t, { email: "franck@example.com", deletionDueAt: Date.now() - 1 });
      const other = await seedCook(t, { email: "marie@example.com" });
      const theirThread = await seedThread(t, cook.userId);
      const otherThread = await seedThread(t, other.userId);

      await purge(t, cook.userId);
      // The component deletes in pages and schedules itself for the next one.
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(await threadOf(t, theirThread)).toBeNull();
      expect(await threadOf(t, otherThread)).not.toBeNull();
    });

    test("a second run finds a tombstone and does nothing", async () => {
      const t = newDeployment();
      const { cook } = await seedFullCook(t, Date.now() - 1);

      await purge(t, cook.userId);
      const afterFirst = await extendedOf(t, cook.userId);

      expect(await purge(t, cook.userId)).toBe("skipped");
      expect(await extendedOf(t, cook.userId)).toEqual(afterFirst);
    });
  });

  describe("scheduled by a request", () => {
    test("runs on its own once the 30 days have passed", async () => {
      vi.useFakeTimers();
      const t = newDeployment();
      const { userId } = await seedCook(t, { email: "franck@example.com" });

      await t.withIdentity(asUser(userId)).mutation(api.router.users.requestDeletion.authed, {});
      // convex-test fires the job when its timer does but leaves the clock where it was, so the
      // clock is moved past the due date by hand, as it would have moved in 30 real days.
      vi.setSystemTime(Date.now() + 31 * DAY);
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect((await extendedOf(t, userId))?.deletedAt).toBeTypeOf("number");
    });

    /** Cancelling is clearing the date. Nothing unschedules the job, so the job has to notice. */
    test("does nothing when the date was cleared in the meantime", async () => {
      vi.useFakeTimers();
      const t = newDeployment();
      const { userId } = await seedCook(t, { email: "franck@example.com" });

      await t.withIdentity(asUser(userId)).mutation(api.router.users.requestDeletion.authed, {});
      await t.run(async (ctx) => {
        const extended = await ctx.db.query("usersExtended").withIndex("by_user", (q) => q.eq("userId", userId)).first();
        if (extended) await ctx.db.patch(extended._id, { deletionDueAt: undefined });
      });
      // convex-test fires the job when its timer does but leaves the clock where it was, so the
      // clock is moved past the due date by hand, as it would have moved in 30 real days.
      vi.setSystemTime(Date.now() + 31 * DAY);
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const extended = await extendedOf(t, userId);
      expect(extended?.deletedAt).toBeUndefined();
      expect((await t.run((ctx) => ctx.db.get(userId)))?.email).toBe("franck@example.com");
    });
  });

  describe("force", () => {
    test("erases everything of theirs, and nothing of anyone else's", async () => {
      const t = newDeployment();
      const { cook, other, recipeId, cookSignIns } = await seedFullCook(t);
      // Archived already, so the live-only read skips it: the detach still has to reach it.
      const archivedId = await insertRecipe(t, cook.userId, true);

      expect(await purge(t, cook.userId, true)).toBe("erased");

      const left = await t.run(async (ctx) => ({
        user: await ctx.db.get(cook.userId),
        extended: await ctx.db.query("usersExtended").withIndex("by_user", (q) => q.eq("userId", cook.userId)).first(),
        preferences: await ctx.db.query("userPreferences").withIndex("by_user", (q) => q.eq("userId", cook.userId)).first(),
        favorites: await ctx.db.query("recipeFavorites").withIndex("by_user", (q) => q.eq("userId", cook.userId)).collect(),
        recipe: await ctx.db.get(recipeId),
        archived: await ctx.db.get(archivedId),
        soloHousehold: await ctx.db.get(cook.householdId),
        soloCellar: await ctx.db.query("cellarItems").withIndex("by_household", (q) => q.eq("householdId", cook.householdId)).collect(),
        sharedHousehold: await ctx.db.get(other.householdId),
        otherUser: await ctx.db.get(other.userId),
      }));

      expect(left.user).toBeNull();
      expect(left.extended).toBeNull();
      expect(left.preferences).toBeNull();
      expect(left.favorites).toEqual([]);
      // Never removed (ADR 0017): archived, so off every list, and pointing at nobody.
      expect(left.recipe).toMatchObject({ isArchived: true });
      expect(left.recipe?.userId).toBeUndefined();
      expect(left.archived).toMatchObject({ isArchived: true });
      expect(left.archived?.userId).toBeUndefined();
      expect(left.soloHousehold).toBeNull();
      expect(left.soloCellar).toEqual([]);
      expect(left.sharedHousehold?.name).toBe("Chez Franck");
      expect(left.otherUser?.email).toBe("marie@example.com");
      expect(await membershipsOf(t, cook.userId)).toEqual([]);

      const signIns = await signInsOf(t, cook.userId, "franck@example.com", cookSignIns);
      expect(signIns.accounts).toEqual([]);
      expect(signIns.sessions).toEqual([]);
      expect(signIns.tokens).toEqual([]);
    });

    /**
     * Why the recipes are archived rather than deleted: deleting one cascades to every planned meal
     * that points at it, in any household, and would erase a meal another cook planned or cooked.
     */
    test("keeps another household's meal of one of their recipes", async () => {
      const t = newDeployment();
      const { cook, other, recipeId } = await seedFullCook(t);
      const mealId = await t.run(async (ctx) => {
        const mealPlanId = await ctx.db.insert("mealPlans", {
          householdId: other.householdId,
          startDate: Date.now(),
          days: 7,
          slots: ["lunch", "dinner"],
          people: 2,
          seed: 1234,
          updatedAt: Date.now(),
        });
        return ctx.db.insert("plannedMeals", {
          mealPlanId,
          householdId: other.householdId,
          recipeId,
          date: Date.now(),
          slot: "dinner",
          servings: 2,
          status: "planned",
          updatedAt: Date.now(),
        });
      });

      await purge(t, cook.userId, true);

      const meal = await t.run((ctx) => ctx.db.get(mealId));
      expect(meal?.recipeId).toBe(recipeId);
    });

    test("runs on an account that never asked", async () => {
      const t = newDeployment();
      const { cook } = await seedFullCook(t);

      expect(await purge(t, cook.userId, true)).toBe("erased");
    });

    test("erases an account that was already anonymized", async () => {
      const t = newDeployment();
      const { cook } = await seedFullCook(t, Date.now() - 1);

      await purge(t, cook.userId);
      expect(await purge(t, cook.userId, true)).toBe("erased");
      expect(await t.run((ctx) => ctx.db.get(cook.userId))).toBeNull();
    });
  });
});
