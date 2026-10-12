import type { Agent, UsageHandler } from "@convex-dev/agent";
import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../../../_generated/api";
import { wrapAgent } from "../../../agent/utils";
import type { Id } from "../../../_generated/dataModel";
import { createIngredient } from "../../../functions/ingredients/createIngredient";
import schema from "../../../schema";
import { registerRateLimiter, rateLimitedCook, warmRateLimiter } from "../../../lib/__tests__/rateLimiter.fixtures";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * The model calls this action can make, mocked so a test can assert on WHETHER each ran and on
 * what the resolver does with its answer — without waiting on, or paying for, a real model: Jev's
 * two judgments about a catalog near-miss (is it the food, is the word worth storing), then the
 * row writer and its two verdicts. Their own behaviour is `matchIngredient`'s and
 * `sanitizeIngredient`'s tests' job; this file is about the wiring around them: that the cheap
 * steps get there first, and that a `new` verdict becomes exactly one row.
 *
 * `pickMeasuredFood` stays real: it only judges a searched hit, and no test here reaches a source.
 */
const sanitizeRun = vi.hoisted(() => vi.fn());
const jev = vi.hoisted(() => ({ matchIngredient: vi.fn(), aliasWorthSaving: vi.fn() }));

vi.mock("@convex/agent/tools/sanitizeIngredient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../agent/tools/sanitizeIngredient")>();
  return { ...actual, sanitizeIngredient: { run: sanitizeRun } };
});

vi.mock("@convex/functions/ingredients/matchIngredient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../functions/ingredients/matchIngredient")>();
  return { ...actual, ...jev };
});

/** Where a recorded call ends up. Mocked so a test can read the events and nothing is scheduled. */
const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

/** A complete fact set, as the agent returns one for a food the catalog does not hold. */
const RUTABAGA = {
  names: {
    fr: { value: "Rutabaga", status: "edited" as const },
    en: { value: "Swede", status: "machine" as const },
  },
  emoji: "\u{1F954}",
  aliases: { fr: ["chou-navet"], en: [] },
  category: "VEGETABLE" as const,
  diet: "vegan" as const,
  allergens: [],
  defaultUnit: "g" as const,
  defaultQuantity: 200,
  nutrition: {
    calories: 36,
    protein: 1.1,
    fat: 0.2,
    saturatedFat: 0,
    carbohydrates: 8.1,
    sugars: 4.5,
    fiber: 2.3,
    sodium: 12,
  },
};

let t: ReturnType<typeof convexTest>;

const seedCarrot = () =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      slug: "carrot",
      name: { values: { en: "Carrot", fr: "Carotte" }, meta: {} },
      emoji: "🥕",
      aliases: { fr: ["carottes"], en: ["carrots"] },
      search: { en: "Carrot carrots", fr: "Carotte carottes" },
      category: "VEGETABLE",
      defaultUnit: "g",
      defaultQuantity: 200,
      nutrition: { calories: 41, protein: 0.9, fat: 0.2, carbohydrates: 10 },
      source: "seed" as const,
      updatedAt: Date.now(),
    }),
  );

/** A whole identity: `loadUser` treats a `users` row with no `usersExtended` as a half-account. */
const signIn = async () => {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });
    await ctx.db.insert("usersExtended", { userId: id, role: "USER", updatedAt: Date.now() });

    return id;
  });

  return t.withIdentity(asUser(userId));
};

/**
 * The module graph this file exercises, imported before anything is timed.
 *
 * `import.meta.glob` hands convex-test LAZY loaders, so the graph a function reaches is transformed
 * and instantiated on the first call that needs it — and billed to whichever test made that call.
 * Here that was the first test in the file, whose own subject is an authorization rejection that
 * should cost microseconds. It was paying ~970ms to pull in resolve.ts and everything beneath it,
 * data/taxonomy.ts (820KB of generated literals) included, against Vitest's default 5s timeout.
 *
 * Idle, that passes. Under a full `pnpm verify` it has twice run out and refused a commit touching
 * no Convex file at all, naming a test with nothing wrong with it — and the margin erodes as the
 * suite grows, since more files means more contention for the same workers.
 *
 * Importing the router module here pulls that graph transitively, inside a hook, off every test's
 * clock: the first test drops from ~970ms to ~5ms and the file's total is unchanged. Nothing is
 * asserted, because nothing needs to be — the point is only that the work is already done.
 *
 * Deliberately narrow. Warming the whole glob instead measured FOUR times slower, because each of
 * the 50 test files that globs convex/ would then import the entire backend rather than the part
 * it uses.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/ingredients/resolve"))
      .map(([, load]) => load()),
  ).then(warmRateLimiter),
);

beforeEach(() => {
  t = convexTest(schema, modules);
  registerRateLimiter(t);
  // Every test in this file must answer from the catalog or the shipped datasets. A test that
  // reaches the network is a test that fails when somebody else's server is down, and this suite
  // runs on every commit.
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network in tests"))));
  // Default verdict: nothing usable. A test that means to exercise the agent says so itself, so a
  // test that forgot to cannot pass on a leftover answer from the one before it.
  sanitizeRun.mockReset();
  sanitizeRun.mockResolvedValue({ verdict: "refused", reason: "not-food" });
  // Jev's default is no link and no alias, for the same reason.
  jev.matchIngredient.mockReset();
  jev.matchIngredient.mockResolvedValue(undefined);
  jev.aliasWorthSaving.mockReset();
  jev.aliasWorthSaving.mockResolvedValue(false);
  capture.mockReset();
});

describe("router/ingredients/resolve", () => {
  /**
   * The gate. `authed` spends money on a miss — two outbound fetches today and a model call once
   * the invention path lands — so the rejection has to happen in the procedure wrapper, before
   * anything is spent.
   */
  test("rejects an unauthenticated caller", async () => {
    await expect(t.action(api.router.ingredients.resolve.authed, { text: "carotte", locale: "fr" })).rejects.toThrow();
  });

  test("rejects an authenticated caller who is not a known user", async () => {
    const ghost = await t.run((ctx) => ctx.db.insert("users", { name: "Ghost" }));
    await t.run((ctx) => ctx.db.delete(ghost));

    await expect(
      t.withIdentity(asUser(ghost)).action(api.router.ingredients.resolve.authed, { text: "carotte", locale: "fr" }),
    ).rejects.toThrow();
  });

  test("refuses a caller who has hit their rate limit, before the catalog, the network or the agent", async () => {
    await seedCarrot();
    const { cook } = await rateLimitedCook(t, "ingredientResolve");

    await expect(cook.action(api.router.ingredients.resolve.authed, { text: "carotte", locale: "fr" })).rejects.toMatchObject({
      data: { code: "RATE_LIMITED" },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(sanitizeRun).not.toHaveBeenCalled();
  });

  test("a name the catalog already holds is matched, and nothing is written", async () => {
    const carrotId = await seedCarrot();
    const before = await t.run((ctx) => ctx.db.query("ingredients").collect());

    const resolved = await (await signIn()).action(api.router.ingredients.resolve.authed, {
      text: "carotte",
      locale: "fr",
    });

    expect(resolved).toEqual({
      status: "matched",
      ingredientId: carrotId,
      name: "Carotte",
      // The row's own answer to "how much of it", which the client has no other way to learn: the
      // placeholder card goes up before there is a row to read it off.
      defaultUnit: "g",
      defaultQuantity: 200,
    });
    expect(await t.run((ctx) => ctx.db.query("ingredients").collect())).toHaveLength(before.length);
  });

  /**
   * Problem 2 of the slice, end to end: the row is indexed under `search_en` and the caller's
   * locale is French, so step 1 alone would have missed it — and inventing a second `carotte` is
   * the failure that never goes away.
   */
  test("a name the catalog holds in the OTHER locale is matched, not invented", async () => {
    const carrotId = await seedCarrot();

    const resolved = await (await signIn()).action(api.router.ingredients.resolve.authed, {
      text: "carrot",
      locale: "fr",
    });

    expect(resolved).toEqual({
      status: "matched",
      ingredientId: carrotId,
      name: "Carotte",
      // The row's own answer to "how much of it", which the client has no other way to learn: the
      // placeholder card goes up before there is a row to read it off.
      defaultUnit: "g",
      defaultQuantity: 200,
    });
  });

  /**
   * The taxonomy step, which is what makes the *previous* test survive a shopper who typed a word
   * the catalog does not carry in either language. "eggplant" is not in this fixture's catalog and
   * is not OFF's canonical English name either — it is a synonym of `en:aubergine`, whose French
   * name is what the catalog would hold.
   */
  test("a synonym reaches the catalog row through the shipped taxonomy", async () => {
    const aubergineId = await t.run((ctx) =>
      ctx.db.insert("ingredients", {
        slug: "eggplant",
        name: { values: { fr: "Aubergine" }, meta: {} },
        emoji: "🍆",
        aliases: {},
        // "eggplant" is in NEITHER index — the catalog only ever knew this row as "aubergine". So
        // no amount of widening reaches it, and only the taxonomy's synonym list can.
        search: { en: "Aubergine", fr: "Aubergine" },
        category: "VEGETABLE",
        defaultUnit: "pcs",
        defaultQuantity: 1,
        nutrition: { calories: 25, protein: 1, fat: 0.2, carbohydrates: 6 },
        source: "seed" as const,
        updatedAt: Date.now(),
      }),
    );

    const resolved = await (await signIn()).action(api.router.ingredients.resolve.authed, {
      text: "eggplant",
      locale: "fr",
    });

    expect(resolved).toMatchObject({ status: "matched", ingredientId: aubergineId });
  });

  /**
   * `MARGIN`, on the resolver's own path. Two rows normalize to the same words and both score 1.0,
   * so linking on the score alone hands the shopper whichever the search index returned first —
   * raw chicken or deli slices, decided by insertion order. A tie is not a confident match: the
   * term has to fall through to a step that can weigh it, and the agent is offered both.
   */
  test("two rows tied at the top are not linked unasked", async () => {
    const seedChicken = (slug: string, fr: string) =>
      t.run((ctx) =>
        ctx.db.insert("ingredients", {
          slug,
          name: { values: { fr }, meta: {} },
          emoji: "🍗",
          aliases: {},
          search: { en: fr, fr },
          category: "MEAT",
          defaultUnit: "g",
          defaultQuantity: 150,
          nutrition: { calories: 165, protein: 31, fat: 3.6, carbohydrates: 0 },
          source: "seed" as const,
          updatedAt: Date.now(),
        }),
      );

    await seedChicken("chicken-breast", "Blanc de poulet");
    await seedChicken("chicken-breast-slices", "Blanc de poulet en tranches");

    const resolved = await (await signIn()).action(api.router.ingredients.resolve.authed, {
      text: "blanc de poulet",
      locale: "fr",
    });

    // Not linked on its own; the tie was handed on rather than guessed at.
    expect(sanitizeRun).toHaveBeenCalled();
    expect(resolved).toMatchObject({ status: "refused" });
  });

  /**
   * The grade has to survive the taxonomy, which files its entries under grade-free spellings.
   * `findInTaxonomy` looks "steak haché 5%" up through `searchTerms`, which strips `pct5`, and the
   * entry it lands on is spelled `steak haché` — so re-searching the catalog with that bare
   * spelling would link 5% mince to an 80/20 row at an exact-alias 0.9, undoing the refusal step 1
   * had already made at 0.667. Four times the fat, on somebody's shopping list.
   */
  test("a grade the shopper typed is not lost when the taxonomy translates the food", async () => {
    const mince = await t.run((ctx) =>
      ctx.db.insert("ingredients", {
        slug: "ground-beef",
        name: { values: { fr: "Bœuf haché (80/20)" }, meta: {} },
        emoji: "🥩",
        aliases: { fr: ["steak haché"], en: [] },
        search: { en: "Beef mince", fr: "Bœuf haché steak haché" },
        category: "MEAT",
        defaultUnit: "g",
        defaultQuantity: 250,
        nutrition: { calories: 254, protein: 17, fat: 20, carbohydrates: 0 },
        source: "seed" as const,
        updatedAt: Date.now(),
      }),
    );

    const resolved = await (await signIn()).action(api.router.ingredients.resolve.authed, {
      text: "steak haché 5%",
      locale: "fr",
    });

    // The 80/20 row is a different product, and must not be handed back as this one.
    expect(resolved).not.toMatchObject({ status: "matched", ingredientId: mince });
  });

  /**
   * The whole ordering, asserted from the cheap end: a term step 1 answers must not reach the step
   * that spends money. Every step before the agent exists to make this true, and the only visible
   * symptom of getting it wrong is a bill.
   */
  test("a term the catalog answers never reaches the agent", async () => {
    await seedCarrot();

    await (await signIn()).action(api.router.ingredients.resolve.authed, {
      text: "carotte",
      locale: "fr",
    });

    expect(sanitizeRun).not.toHaveBeenCalled();
  });

  /**
   * A keyword search answers every term, including the ones it cannot answer.
   *
   * USDA matched the token `de` in `eau de fleur d'oranger` and returned `Pastry, Pastelitos de
   * Guava` — a real food, and not this one. Spent on the catalog unchecked, that name was treated
   * as another spelling of what the shopper typed, and it linked at 0.90 to the one row whose
   * aliases happened to carry that exact string. In production that put 30g of pistachio paste on
   * a grocery list: the placeholder vanished, no error was shown, and the agent never ran.
   *
   * The row here is seeded carrying that alias deliberately — it is what the catalog looked like,
   * and a source's junk becoming a row's vocabulary is a separate defect with its own fix. This
   * asserts the resolver no longer *acts* on it: the name is not about the term, so it is never
   * spent on the catalog, and the word reaches the step that can read it.
   */
  test("a keyword hit that is not about the term never links, and the agent still runs", async () => {
    await t.run((ctx) =>
      ctx.db.insert("ingredients", {
        name: { values: { en: "pistachio paste", fr: "pâte de pistache" }, meta: {} },
        emoji: "🥜",
        aliases: { en: ["Pastry, Pastelitos de Guava (guava pastries)"], fr: [] },
        search: {
          en: "pistachio paste pastry pastelitos de guava pastries",
          fr: "pâte de pistache",
        },
        category: "OTHER",
        defaultUnit: "g",
        defaultQuantity: 30,
        nutrition: { calories: 495, protein: 25, fat: 34, carbohydrates: 35 },
        source: "openFoodFacts" as const,
        updatedAt: Date.now(),
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("nal.usda.gov")
          ? Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                foods: [{ description: "Pastry, Pastelitos de Guava (guava pastries)" }],
              }),
          })
          : Promise.reject(new Error("no network in tests")),
      ),
    );

    const resolved = await (await signIn()).action(api.router.ingredients.resolve.authed, {
      text: "eau de fleur d'oranger",
      locale: "fr",
    });

    expect(resolved).toEqual({ status: "refused", reason: "not-food" });
    expect(sanitizeRun).toHaveBeenCalledOnce();
  });

  /**
   * The refusal path, and the reason it is the agent's to decide rather than a step running out:
   * nothing before this can tell a food we have never heard of from washing-up liquid. `fetch` is
   * stubbed to reject for the whole file, so this is also the assertion that a third-party outage
   * does not stop the term reaching the one step that can judge it.
   */
  test("a term no source can answer is put to the agent, and its refusal is passed through", async () => {
    await seedCarrot();

    const resolved = await (await signIn()).action(api.router.ingredients.resolve.authed, {
      text: "liquide vaisselle",
      locale: "fr",
    });

    expect(resolved).toEqual({ status: "refused", reason: "not-food" });
    expect(sanitizeRun).toHaveBeenCalledOnce();
  });

  /**
   * Steps 4 and 5. Exactly one row, and the second identical call gets it back from step 1 —
   * without the model, which is the cheap defence against duplicates. The race below is the other.
   */
  test("a genuine miss creates one row, and a second identical call matches it", async () => {
    sanitizeRun.mockResolvedValue({ verdict: "new", facts: RUTABAGA, source: "agent" });
    const asShopper = await signIn();

    const created = await asShopper.action(api.router.ingredients.resolve.authed, {
      text: "rutabaga",
      locale: "fr",
    });

    expect(created).toMatchObject({ status: "created", name: "Rutabaga", source: "agent" });

    const again = await asShopper.action(api.router.ingredients.resolve.authed, {
      text: "rutabaga",
      locale: "fr",
    });

    expect(again).toMatchObject({ status: "matched", name: "Rutabaga" });
    expect(await t.run((ctx) => ctx.db.query("ingredients").collect())).toHaveLength(1);
    // Once for the create; the second call was answered by the catalog it had just grown.
    expect(sanitizeRun).toHaveBeenCalledOnce();
  });

  /**
   * The recipe-import race that grew two `coriandre` rows eight seconds apart: two walks for the
   * same food both passed step 1 on an empty catalog, and each inserted what its model call named.
   * Here the other walk's insert lands DURING this walk's model call — after step 1 searched, before
   * step 5 writes — and the write has to find it rather than add a second.
   */
  test("a row written by a parallel walk during the model call is matched, not duplicated", async () => {
    let parallelId: Id<"ingredients"> | undefined;
    sanitizeRun.mockImplementation(async () => {
      const parallel = await t.run((ctx) => createIngredient(ctx, RUTABAGA, "agent"));
      if (parallel.created) parallelId = parallel.ingredientId;

      return { verdict: "new", facts: RUTABAGA, source: "agent" };
    });

    const resolved = await (await signIn()).action(api.router.ingredients.resolve.authed, {
      text: "rutabaga",
      locale: "fr",
    });

    expect(resolved).toMatchObject({ status: "matched", ingredientId: parallelId, name: "Rutabaga" });
    expect(await t.run((ctx) => ctx.db.query("ingredients").collect())).toHaveLength(1);
  });

  /**
   * `source` records where the NUMBERS came from, not which step decided the category — and the
   * step that decides it is the tool, which is the only place that knows which hits actually
   * contributed a figure (`measuredAboutIt`). So this asserts the two halves of the wiring the
   * router still owns: that step 2 gathers a figure-bearing hit on the way past and HANDS it to
   * the agent, and that the row records what came back rather than a second opinion computed here.
   *
   * The rule itself — measured figures win the provenance, figures measured on another food do not
   * even reach it — is `toSanitizedIngredient`'s test, where no mock stands in for it.
   */
  test("hands the measured hit to the agent, and records the provenance it answers with", async () => {
    sanitizeRun.mockResolvedValue({
      verdict: "new",
      source: "foodComposition",
      facts: {
        ...RUTABAGA,
        names: {
          fr: { value: "Papaye", status: "edited" as const },
          en: { value: "Papaya", status: "edited" as const },
        },
      },
    });

    const resolved = await (await signIn()).action(api.router.ingredients.resolve.authed, {
      // In the shipped taxonomy AND carrying a CIQUAL code the composition table measured, so
      // step 2 gathers a figure-bearing hit on the way past. "rutabaga" above is in the taxonomy
      // and NOT in CIQUAL, which is why that row is honestly `source: "agent"`.
      text: "papaya",
      locale: "en",
    });

    expect(sanitizeRun.mock.calls[0]?.[1]?.hits?.[0]).toMatchObject({ source: "foodComposition" });
    expect(resolved).toMatchObject({ status: "created", source: "foodComposition" });
  });

  /**
   * The candidates step 1 declined on its score alone are exactly the cases a threshold cannot
   * settle, and a reader is better at them. That verdict writes nothing: the id came out of the
   * list the resolver handed over (ADR 0010).
   */
  test("the agent picking a candidate is a match, and inserts nothing", async () => {
    const carrotId = await seedCarrot();
    jev.matchIngredient.mockImplementation(async ({ candidates }) =>
      candidates.find(({ ingredientId }: { ingredientId: string }) => ingredientId === carrotId));
    // Jev's other answer: `carottes en rondelles` is a cut, not another word for the food, so the
    // row must not be indexed under it.
    jev.aliasWorthSaving.mockResolvedValue(false);

    const resolved = await (await signIn()).action(api.router.ingredients.resolve.authed, {
      // 0.563 against the row: a near-miss step 1 hands on, so the link is Jev's to make.
      text: "carottes en rondelles",
      locale: "fr",
    });

    expect(resolved).toEqual({
      status: "matched",
      ingredientId: carrotId,
      name: "Carotte",
      // The row's own answer to "how much of it", which the client has no other way to learn: the
      // placeholder card goes up before there is a row to read it off.
      defaultUnit: "g",
      defaultQuantity: 200,
    });
    expect(await t.run((ctx) => ctx.db.query("ingredients").collect())).toHaveLength(1);
    // A refused word is not written down: the row must not become findable under a keyboard slip.
    expect(await t.run((ctx) => ctx.db.get(carrotId))).toMatchObject({
      aliases: { fr: ["carottes"], en: ["carrots"] },
    });
  });

  /**
   * The step that makes the agent branch cheaper the second time.
   *
   * A term reaching step 4 costs a ranker call, and nothing recorded what that call decided — so
   * the same word was judged, linked and forgotten on every shopper who typed it. When the ranker
   * says the word is a real word for the food, it is written onto the row, and the assertion that
   * matters is the SECOND call: it resolves without the agent being asked at all.
   */
  test("a word the ranker vouches for is remembered, and answered for free next time", async () => {
    const carrotId = await seedCarrot();
    jev.matchIngredient.mockImplementation(async ({ candidates }) =>
      candidates.find(({ ingredientId }: { ingredientId: string }) => ingredientId === carrotId));
    jev.aliasWorthSaving.mockResolvedValue(true);

    const user = await signIn();
    const first = await user.action(api.router.ingredients.resolve.authed, {
      // A regional name for the food, not a slip: it scores 0.643 against the row, a near-miss
      // step 1 hands on rather than links, so only Jev's judgment can tie it to the carrot.
      text: "carottes des sables",
      locale: "fr",
    });

    expect(first).toMatchObject({ status: "matched", ingredientId: carrotId });
    expect(jev.matchIngredient).toHaveBeenCalledTimes(1);

    // The write is SCHEDULED rather than awaited, so that a conflict on a hot catalog row cannot
    // fail a resolve that already succeeded. Draining it here is what makes the caching observable
    // — and the drain being necessary is itself the assertion that the shopper never waited on it.
    // Fake timers only for the drain: `finishAllScheduledFunctions` advances them itself, and the
    // action above has already returned, so nothing real is left waiting on a clock.
    vi.useFakeTimers();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();

    // Both fields, because only one of them is reachable: an alias stored without its `search`
    // entry is an alias no shopper can ever find, and nothing would report it (ADR 0011).
    const row = await t.run((ctx) => ctx.db.get(carrotId));
    expect(row?.aliases?.fr).toEqual(["carottes", "carottes des sables"]);
    expect(row?.search?.fr).toContain("carottes des sables");

    const second = await user.action(api.router.ingredients.resolve.authed, {
      text: "carottes des sables",
      locale: "fr",
    });

    expect(second).toMatchObject({ status: "matched", ingredientId: carrotId });
    // The whole point: step 1 answered it, so the model was never asked a second time.
    expect(jev.matchIngredient).toHaveBeenCalledTimes(1);
  });

  /**
   * A model that cannot answer must not be reported as a shopper who wrote nonsense: `unreadable`
   * is "we read that and could make nothing of it". The client awaits this action and turns a
   * throw into an error card, so the outage is visible without claiming a judgement was made.
   */
  /**
   * What PostHog averages per route. Each paid call reports its usage the way the real one does
   * (Jev through `report`, the row writer through the `usageHandler` `wrapAgent` gives the agent),
   * and both have to land under this route and under ONE trace, or a resolve's cost is split across
   * two rows. The writer runs through the real `wrapAgent` with the ctx the tool was handed, so
   * this also pins that the ctx reaching the tool still carries the trace.
   */
  test("every paid call of a miss is recorded under ingredients/resolve, in one trace, for the cook", async () => {
    await seedCarrot();
    jev.matchIngredient.mockImplementation(async ({ report }) => {
      await report?.({ model: "jev-1.13.0", inputTokens: 410, outputTokens: 18, costUsd: 0.0009, latencyMs: 640 });
      return undefined;
    });
    // An agent that bills the way the SDK does: to the handler in its call's options.
    const ingredientsAgent = {
      generateObject: async (_ctx: unknown, _thread: unknown, _call: unknown, options: { usageHandler: UsageHandler }) => {
        await options.usageHandler({} as never, {
          agentName: "Cuisko Ingredient Agent",
          model: "openai/gpt-6-luna",
          provider: "openrouter.chat",
          usage: { inputTokens: 1800, outputTokens: 350 },
          providerMetadata: { openrouter: { usage: { cost: 0.0042 } } },
        } as never);
        return { object: { verdict: "not-food" } };
      },
    } as unknown as Agent;
    sanitizeRun.mockImplementation(async (ctx) => {
      await wrapAgent(ingredientsAgent).generateObject(ctx, {}, { prompt: "liquide vaisselle" });
      return { verdict: "refused", reason: "not-food" };
    });

    // 0.563 against the carrot row: a near-miss, so Jev is asked before the writer.
    await (await signIn()).action(api.router.ingredients.resolve.authed, { text: "carottes en rondelles", locale: "fr" });

    const [cook] = await t.run((ctx) => ctx.db.query("users").collect());
    const events = capture.mock.calls.map(([, event]) => event);
    expect(events.map((event) => event.properties.$ai_span_name)).toEqual(["jev.nearMiss", "Cuisko Ingredient Agent"]);
    expect(new Set(events.map((event) => event.properties.$ai_trace_id)).size).toBe(1);
    for (const event of events) {
      expect(event).toMatchObject({ event: "$ai_generation", distinctId: cook!._id });
      expect(event.properties.operation).toBe("ingredients/resolve");
    }
  });

  test("a model that throws fails the resolve rather than refusing the term", async () => {
    sanitizeRun.mockRejectedValue(new Error("provider is down"));

    await expect(
      (await signIn()).action(api.router.ingredients.resolve.authed, { text: "rutabaga", locale: "fr" }),
    ).rejects.toThrow();

    expect(await t.run((ctx) => ctx.db.query("ingredients").collect())).toHaveLength(0);
  });

  test("empty text is refused without asking anything", async () => {
    const resolved = await (await signIn()).action(api.router.ingredients.resolve.authed, {
      text: "   ",
      locale: "fr",
    });

    expect(resolved).toEqual({ status: "refused", reason: "unreadable" });
    expect(fetch).not.toHaveBeenCalled();
    expect(sanitizeRun).not.toHaveBeenCalled();
  });

  test("_internal_search widens across both locale indexes", async () => {
    const carrotId = await seedCarrot();

    const found = await t.query(internal.router.ingredients.resolve._internal_search, {
      text: "carrot",
      locale: "fr",
    });

    expect(found[0]?.ingredientId).toBe(carrotId);
  });
});
