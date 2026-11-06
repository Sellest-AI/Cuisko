import type { ToolCtx } from "@convex-dev/mcp";
import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api, components, internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
import { modules } from "@convex/lib/__tests__/modules.fixtures";
import { planPlate } from "../functions/mcp/planPlate";
import { enforceRateLimit } from "../functions/rateLimits/enforceRateLimit";
import { registerMcp, warmMcp } from "../lib/__tests__/mcp.fixtures";
import { registerRateLimiter, warmRateLimiter } from "../lib/__tests__/rateLimiter.fixtures";
import { RATE_LIMITS } from "../lib/rateLimits";
import { mcp } from "../mcp";
import schema from "../schema";

/** Imports the routes, the mount file, what a tool runs and the components before any test is timed (C10 rule 4). */
beforeAll(() =>
  Promise.all([
    ...Object.entries(modules)
      .filter(([path]) =>
        [
          "/convex/http.",
          "/convex/mcp.",
          "/convex/router/users/getMcpUser.",
          "/convex/router/recipes/search.",
          "/convex/router/recipes/getOne.",
          "/convex/router/recipes/missingIds.",
          "/convex/router/planning/getMany.",
          "/convex/router/planning/planOne.",
        ].some((module) => path.startsWith(module)),
      )
      .map(([, load]) => load()),
    warmMcp(),
    warmRateLimiter(),
  ]),
);

const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

const DAY = 86_400_000;

let t: ReturnType<typeof convexTest>;

/** A plate books a skip job, which a real timer would fire under the assertion: see planOne.test.ts. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  t = convexTest(schema, modules);
  registerMcp(t);
  registerRateLimiter(t);
  capture.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const seedCook = (name = "Cook", fields: { deletedAt?: number } = {}) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    const extendedId = await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now(), ...fields });
    const householdId = await ctx.db.insert("households", { name, inviteCode: name, updatedAt: Date.now() });
    await ctx.db.insert("householdUsers", { householdId, userId });
    return { userId, extendedId, householdId };
  });

/** A recipe of one 200 g line, written for two, kept in both languages. */
const seedRecipe = (english: string, french = english) =>
  t.run(async (ctx) => {
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { en: `${english} base`, fr: `${french} base` }, meta: {} },
      category: "VEGETABLE",
      emoji: "🍅",
      defaultUnit: "g",
      defaultQuantity: 500,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    });
    const recipeId = await insertTestRecipe(ctx.db, {
      title: { values: { en: english, fr: french }, meta: {} },
      description: { values: { en: "A dish.", fr: "Un plat." }, meta: {} },
      timings: { cooking: 20 },
      shuffleKey: 1_000,
      isVegan: true,
      isVegetarian: true,
      isPescatarian: true,
      search: { en: english.toLowerCase(), fr: french.toLowerCase() },
    });
    await ctx.db.insert("recipeIngredients", { recipeId, ingredientId, position: 0, quantity: 200, unit: "g", updatedAt: Date.now() });
    return { recipeId, ingredientId };
  });

const COVER_URL = "https://example.com/cover.webp";

/** The start of a WebP file, labelled as the image host labels every file it serves. */
const webpCover = () =>
  new Response(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "), { headers: { "Content-Type": "binary/octet-stream" } });

/** A real WebP header on a file far past any cover: the bytes alone would pass as an image. */
const hugeWebpCover = () => {
  const bytes = new Uint8Array(2 * 1024 * 1024);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);

  return new Response(bytes);
};

/** A cover and a plate on one recipe, each with the one size `getImage` reads. */
const seedImages = (recipeId: Id<"recipes">) =>
  t.run(async (ctx) => {
    const insertImage = async (url: string) => {
      const row = { key: url, url, width: 512, height: 512, size: 100_000 };
      const imageId = await ctx.db.insert("images", {
        ...row,
        hasAlpha: false,
        mimeType: "image/webp",
        tags: ["IMAGE"],
        updatedAt: Date.now(),
      });
      await ctx.db.insert("imageSizes", { ...row, imageId, quality: 80 });
      return imageId;
    };

    await ctx.db.patch(recipeId, {
      coverImageId: await insertImage(COVER_URL),
      plateImageId: await insertImage("https://example.com/plate.webp"),
    });
  });

const tokenFor = async (userId: Id<"users">, scopes?: string[]) =>
  t.action(internal.mcp.createApiKeyForUser, { userId, ...(scopes && { scopes }) });

const post = (method: string, params: unknown, token?: string) =>
  t.fetch("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

const callTool = async (token: string, name: string, args: unknown) => {
  const response = await post("tools/call", { name, arguments: args }, token);
  const { result } = await response.json();
  return { isError: result.isError === true, text: result.content[0].text as string };
};

/** The whole result, for the tool whose answer is more than one block. */
const toolBlocks = async (token: string, name: string, args: unknown) => {
  const response = await post("tools/call", { name, arguments: args }, token);
  const { result } = await response.json();
  return result.content as { type: string; text?: string; data?: string; mimeType?: string }[];
};

const toolResult = async (token: string, name: string, args: unknown) => {
  const { isError, text } = await callTool(token, name, args);
  expect(isError, text).toBe(false);
  return JSON.parse(text);
};

const toolNames = async (token: string): Promise<{ name: string; inputSchema: { properties: object } }[]> => {
  const response = await post("tools/list", {}, token);
  return (await response.json()).result.tools;
};

/** A dateTime `days` from now, at an offset of zero: the cook's midnight is then UTC's. */
const dayAhead = (days: number) => `${new Date(Date.now() + days * DAY).toISOString().slice(0, 10)}T19:30:00+00:00`;

const midnightAhead = (days: number) => Date.parse(`${dayAhead(days).slice(0, 10)}T00:00:00Z`);

const platesOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("plannedMeals").collect();
    return rows.filter((row) => row.householdId === householdId);
  });

const listOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("groceryListItems").collect();
    return rows.filter((row) => row.householdId === householdId);
  });

const drainLimit = (userId: Id<"users">) =>
  t.run((ctx) => enforceRateLimit({ ...ctx, userId, user: { role: "USER" } }, "mcpCall", RATE_LIMITS.mcpCall.capacity));

describe("the MCP server", () => {
  test("declares what the component's lint asks of every tool", () => {
    expect(mcp.lint()).toEqual([]);
  });

  test("no tool lets a model name the cook, their household or a locale (ADR 0020)", async () => {
    const { userId } = await seedCook();
    const { apiKey } = await tokenFor(userId);

    const tools = await toolNames(apiKey);

    expect(tools.map(({ name }) => name).sort()).toEqual(["get_recipe", "plan_meal", "search_recipes"]);
    for (const { inputSchema } of tools) {
      expect(Object.keys(inputSchema.properties)).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^(userId|householdId|locale)$/)]),
      );
    }
  });

  test("refuses a call with no token", async () => {
    expect((await post("tools/list", {})).status).toBe(401);
  });

  test("refuses a revoked connection", async () => {
    const { userId } = await seedCook();
    const { apiKey, id } = await tokenFor(userId);

    await t.run((ctx) => ctx.runMutation(components.mcp.grants.revoke, { userId, grantId: id }));

    expect((await post("tools/list", {}, apiKey)).status).toBe(401);
  });

  test("a read-only connection cannot plan", async () => {
    const { userId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(userId, ["recipes:read"]);

    const response = await post(
      "tools/call",
      { name: "plan_meal", arguments: { recipeId, dateTime: dayAhead(1), slot: "dinner", servings: 2 } },
      apiKey,
    );

    expect(response.status).toBe(403);
  });
});

describe("the consent page functions", () => {
  const asCook = (userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

  test("refuse a caller with no session", async () => {
    await expect(t.action(api.mcp.authorize, { requestId: "any", approve: true })).rejects.toThrow(/Not signed in/);
    await expect(t.mutation(api.mcp.revokeConnection, { id: "any" })).rejects.toThrow(/Not signed in/);
    expect(await t.query(api.mcp.listConnections, {})).toEqual([]);
  });

  test("list only the caller's connections", async () => {
    const mine = await seedCook("Mine");
    const theirs = await seedCook("Theirs");
    const { id } = await tokenFor(mine.userId);

    expect((await asCook(mine.userId).query(api.mcp.listConnections, {})).map((connection) => connection.id)).toEqual([id]);
    expect(await asCook(theirs.userId).query(api.mcp.listConnections, {})).toEqual([]);
  });

  test("never revoke another cook's connection", async () => {
    const mine = await seedCook("Mine");
    const theirs = await seedCook("Theirs");
    const { apiKey, id } = await tokenFor(mine.userId);

    await asCook(theirs.userId).mutation(api.mcp.revokeConnection, { id });
    expect((await post("tools/list", {}, apiKey)).status).toBe(200);

    await asCook(mine.userId).mutation(api.mcp.revokeConnection, { id });
    expect((await post("tools/list", {}, apiKey)).status).toBe(401);
  });

  test("an unknown request reads as nothing, and cannot be approved", async () => {
    const { userId } = await seedCook();

    expect(await asCook(userId).query(api.mcp.getAuthRequest, { requestId: "unknown" })).toBeNull();
    await expect(asCook(userId).action(api.mcp.authorize, { requestId: "unknown", approve: true })).rejects.toThrow(/expired/);
  });
});

describe("the limit", () => {
  const argsFor = (recipeId: string): Record<string, object> => ({
    search_recipes: { queries: ["curry"] },
    get_recipe: { id: recipeId },
    plan_meal: { recipeId, dateTime: dayAhead(1), slot: "dinner", servings: 2 },
  });

  /** Reads `tools/list`, so a future tool with no args here is red, and one that skips `runTool` is too. */
  test("refuses every tool past the bucket, bare, with nothing read or written", async () => {
    const { userId, householdId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(userId);
    await drainLimit(userId);

    for (const { name } of await toolNames(apiKey)) {
      const args = argsFor(recipeId)[name];
      expect(args, `no args for ${name}`).toBeDefined();

      expect(await callTool(apiKey, name, args)).toEqual({
        isError: true,
        text: "Too many calls to Cuisko. Stop and try again in a bit.",
      });
    }

    expect(await platesOf(householdId)).toEqual([]);
  });

  test("is per cook: one cook's loop leaves another working", async () => {
    const { userId } = await seedCook("One");
    const other = await seedCook("Other");
    const { apiKey } = await tokenFor(other.userId);
    await drainLimit(userId);

    expect((await callTool(apiKey, "search_recipes", { queries: ["curry"] })).isError).toBe(false);
  });
});

describe("search_recipes", () => {
  test("finds a recipe by its English name, whatever language it was written in", async () => {
    const { userId } = await seedCook();
    const { recipeId } = await seedRecipe("Beef stew", "Boeuf bourguignon");
    const { apiKey } = await tokenFor(userId);

    expect(await toolResult(apiKey, "search_recipes", { queries: ["beef stew"] })).toEqual({
      results: [{ query: "beef stew", recipes: [{ id: recipeId, title: "Beef stew" }] }],
    });
  });

  test("answers a name past the bound with a sentence the model can fix", async () => {
    const { userId } = await seedCook();
    const { apiKey } = await tokenFor(userId);

    const { isError, text } = await callTool(apiKey, "search_recipes", { queries: ["a", "b", "c", "d", "e", "f"] });

    expect(isError).toBe(true);
    expect(text).toMatch(/^Invalid arguments/);
  });
});

describe("get_recipe", () => {
  test("returns the recipe and nothing that names its author", async () => {
    const { userId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(userId);

    const recipe = await toolResult(apiKey, "get_recipe", { id: recipeId });

    expect(Object.keys(recipe).sort()).toEqual([
      "description", "id", "ingredients", "instructions", "minutes", "servings", "title",
    ]);
    expect(recipe).toMatchObject({ id: recipeId, title: "Curry", servings: 2, minutes: 20 });
    expect(recipe.ingredients).toEqual([{ name: "Curry base", quantity: 200, unit: "g" }]);
  });

  test("returns the recipe's cover, as a link and as an image, and not its plate", async () => {
    const download = vi.fn(async (_url: string) => webpCover());
    vi.stubGlobal("fetch", download);
    const { userId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    await seedImages(recipeId);
    const { apiKey } = await tokenFor(userId);

    const blocks = await toolBlocks(apiKey, "get_recipe", { id: recipeId });

    expect(JSON.parse(blocks[0]!.text!).coverImageUrl).toBe(COVER_URL);
    expect(blocks[0]!.text).not.toContain("plate.webp");
    expect(download.mock.calls.map(([url]) => url)).toEqual([COVER_URL]);
    expect(blocks[1]).toEqual({ type: "image", data: btoa("RIFF\0\0\0\0WEBPVP8 "), mimeType: "image/webp" });
  });

  test.each([
    ["the download fails", () => Promise.reject(new Error("down"))],
    ["the file is gone", () => Promise.resolve(new Response("Not found", { status: 404 }))],
    ["the answer is not an image", () => Promise.resolve(new Response("<html>", { headers: { "Content-Type": "text/html" } }))],
    ["the file is far too large", () => Promise.resolve(hugeWebpCover())],
  ])("still returns the recipe, with no image, when %s", async (_name, download) => {
    vi.stubGlobal("fetch", vi.fn(download));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { userId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    await seedImages(recipeId);
    const { apiKey } = await tokenFor(userId);

    const blocks = await toolBlocks(apiKey, "get_recipe", { id: recipeId });

    expect(JSON.parse(blocks[0]!.text!).title).toBe("Curry");
    expect(blocks.map(({ type }) => type)).toEqual(["text"]);
    expect(logged).toHaveBeenCalled();
  });

  test("gives up on a host that never answers, and still returns the recipe", async () => {
    let reachHost = () => {};
    const reached = new Promise<void>((resolve) => {
      reachHost = resolve;
    });
    const download = vi.fn((_url: string, _init?: RequestInit) => {
      reachHost();
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", download);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { userId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    await seedImages(recipeId);
    const { apiKey } = await tokenFor(userId);

    const answer = toolBlocks(apiKey, "get_recipe", { id: recipeId });
    await reached;
    await vi.advanceTimersByTimeAsync(5000);
    const blocks = await answer;

    expect(JSON.parse(blocks[0]!.text!).title).toBe("Curry");
    expect(blocks.map(({ type }) => type)).toEqual(["text"]);
    expect(logged).toHaveBeenCalled();
    expect(download.mock.calls[0]![1]?.signal?.aborted).toBe(true);
  });

  test("downloads nothing for a recipe with no cover", async () => {
    const download = vi.fn();
    vi.stubGlobal("fetch", download);
    const { userId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(userId);

    const blocks = await toolBlocks(apiKey, "get_recipe", { id: recipeId });

    expect(blocks.map(({ type }) => type)).toEqual(["text"]);
    expect(download).not.toHaveBeenCalled();
  });

  test.each(["jd7fnotanid", ""])("answers a bad id (%j) with a sentence", async (id) => {
    const { userId } = await seedCook();
    const { apiKey } = await tokenFor(userId);

    const { isError, text } = await callTool(apiKey, "get_recipe", { id });

    expect(isError).toBe(true);
    expect(text).toMatch(/does not exist/);
  });
});

describe("plan_meal", () => {
  test("writes the plate the grid would: on the cook's midnight, listing what is missing, reported once", async () => {
    const { userId, householdId } = await seedCook();
    const { recipeId, ingredientId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(userId);

    const answer = await toolResult(apiKey, "plan_meal", { recipeId, dateTime: dayAhead(1), slot: "dinner", servings: 2 });

    expect(answer).toEqual({ status: "planned", date: dayAhead(1).slice(0, 10), slot: "dinner" });
    expect(await platesOf(householdId)).toMatchObject([
      { recipeId, date: midnightAhead(1), slot: "dinner", servings: 2, status: "planned" },
    ]);
    expect(await listOf(householdId)).toMatchObject([{ ingredientId, quantity: 200, unit: "g" }]);
    expect(capture.mock.calls.filter(([, args]) => args.event === "plate planned")).toHaveLength(1);
  });

  test("a slot already held answers `occupied` with its recipe, and writes nothing", async () => {
    const { userId, householdId } = await seedCook();
    const curry = await seedRecipe("Curry");
    const stew = await seedRecipe("Stew");
    const { apiKey } = await tokenFor(userId);
    const plate = { dateTime: dayAhead(1), slot: "dinner", servings: 2 };
    await toolResult(apiKey, "plan_meal", { recipeId: curry.recipeId, ...plate });

    const answer = await toolResult(apiKey, "plan_meal", { recipeId: stew.recipeId, ...plate });

    expect(answer).toMatchObject({
      status: "occupied",
      current: { recipeId: curry.recipeId, title: "Curry", servings: 2 },
    });
    expect(await platesOf(householdId)).toMatchObject([{ recipeId: curry.recipeId }]);
  });

  test("a retry reads as its own plate, with no duplicate", async () => {
    const { userId, householdId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(userId);
    const plate = { recipeId, dateTime: dayAhead(1), slot: "dinner", servings: 2 };
    await toolResult(apiKey, "plan_meal", plate);

    expect((await toolResult(apiKey, "plan_meal", plate)).current.recipeId).toBe(recipeId);
    expect(await platesOf(householdId)).toHaveLength(1);
  });

  test("replace takes the slot and names the dish that went, so it can be planned back", async () => {
    const { userId, householdId } = await seedCook();
    const curry = await seedRecipe("Curry");
    const stew = await seedRecipe("Stew");
    const { apiKey } = await tokenFor(userId);
    const plate = { dateTime: dayAhead(1), slot: "dinner", servings: 2 };
    await toolResult(apiKey, "plan_meal", { recipeId: curry.recipeId, ...plate });

    const answer = await toolResult(apiKey, "plan_meal", { recipeId: stew.recipeId, ...plate, replace: true });

    expect(answer.replaced).toEqual({ recipeId: curry.recipeId, title: "Curry", servings: 2 });
    expect(await platesOf(householdId)).toMatchObject([{ recipeId: stew.recipeId }]);
  });

  /** The write has happened, so an answer that fails here would tell the cook nothing was planned. */
  test("still names the dish that went when it is deleted right after the swap", async () => {
    const { userId, householdId } = await seedCook();
    const curry = await seedRecipe("Curry");
    const stew = await seedRecipe("Stew");
    const { apiKey } = await tokenFor(userId);
    const plate = { dateTime: dayAhead(1), slot: "dinner" as const, servings: 2 };
    await toolResult(apiKey, "plan_meal", { recipeId: curry.recipeId, ...plate });
    const deletingAfterTheWrite = {
      runQuery: t.query,
      runMutation: async (...call: unknown[]) => {
        const planned = await (t.mutation as (...args: unknown[]) => Promise<unknown>)(...call);
        await t.run((ctx) => ctx.db.delete(curry.recipeId));
        return planned;
      },
    } as unknown as ToolCtx;

    const answer = await planPlate(deletingAfterTheWrite, { userId, role: "USER", householdId }, "en", {
      recipeId: stew.recipeId,
      ...plate,
      replace: true,
    });

    expect(answer.replaced).toEqual({ recipeId: curry.recipeId, title: "Curry", servings: 2 });
  });

  test.each([
    ["a day in the past", -1, /cannot be planned/],
    ["a day past the window", 9, /cannot be planned/],
  ])("answers %s with a sentence", async (_case, days, message) => {
    const { userId, householdId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(userId);

    const { isError, text } = await callTool(apiKey, "plan_meal", { recipeId, dateTime: dayAhead(days), slot: "dinner", servings: 2 });

    expect(isError).toBe(true);
    expect(text).toMatch(message);
    expect(await platesOf(householdId)).toEqual([]);
  });

  test("answers a cooked slot with a sentence", async () => {
    const { userId, householdId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(userId);
    const plate = { recipeId, dateTime: dayAhead(1), slot: "dinner", servings: 2 };
    await toolResult(apiKey, "plan_meal", plate);
    const [planned] = await platesOf(householdId);
    await t.run((ctx) => ctx.db.patch(planned!._id, { status: "cooked" }));

    const { isError, text } = await callTool(apiKey, "plan_meal", plate);

    expect(isError).toBe(true);
    expect(text).toMatch(/already cooked/);
  });

  test("answers bad servings, a bad dateTime and an unknown recipe with something the model can fix", async () => {
    const { userId, householdId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(userId);
    const plate = { recipeId, dateTime: dayAhead(1), slot: "dinner", servings: 2 };

    expect((await callTool(apiKey, "plan_meal", { ...plate, servings: 0 })).text).toMatch(/^Invalid arguments/);
    expect((await callTool(apiKey, "plan_meal", { ...plate, dateTime: "tomorrow" })).text).toMatch(/UTC offset/);
    expect((await callTool(apiKey, "plan_meal", { ...plate, recipeId: "gone" })).text).toMatch(/does not exist/);
    expect((await callTool(apiKey, "plan_meal", { recipeId, slot: "dinner", servings: 2 })).text).toMatch(/^Invalid arguments/);
    expect(await platesOf(householdId)).toEqual([]);
  });

  test("one cook's token never touches another's household", async () => {
    const mine = await seedCook("Mine");
    const theirs = await seedCook("Theirs");
    const { recipeId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(mine.userId);

    await toolResult(apiKey, "plan_meal", { recipeId, dateTime: dayAhead(1), slot: "dinner", servings: 2 });

    expect(await platesOf(mine.householdId)).toHaveLength(1);
    expect(await platesOf(theirs.householdId)).toEqual([]);
  });

  test("a cook who switched household plans on the new one on the next call", async () => {
    const { userId, extendedId, householdId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(userId);
    const other = await t.run(async (ctx) => {
      const id = await ctx.db.insert("households", { name: "Other", inviteCode: "OTHER", updatedAt: Date.now() });
      await ctx.db.insert("householdUsers", { householdId: id, userId });
      await ctx.db.patch(extendedId, { currentHouseholdId: id });
      return id;
    });

    await toolResult(apiKey, "plan_meal", { recipeId, dateTime: dayAhead(1), slot: "dinner", servings: 2 });

    expect(await platesOf(other)).toHaveLength(1);
    expect(await platesOf(householdId)).toEqual([]);
  });

  test("a cook with a deletion pending still plans", async () => {
    const { userId, extendedId, householdId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(userId);
    await t.run((ctx) => ctx.db.patch(extendedId, { deletionDueAt: Date.now() + 30 * DAY }));

    await toolResult(apiKey, "plan_meal", { recipeId, dateTime: dayAhead(1), slot: "dinner", servings: 2 });

    expect(await platesOf(householdId)).toHaveLength(1);
  });

  test("an anonymized cook's token answers a sentence, and writes nothing", async () => {
    const { userId, extendedId, householdId } = await seedCook();
    const { recipeId } = await seedRecipe("Curry");
    const { apiKey } = await tokenFor(userId);
    await t.run((ctx) => ctx.db.patch(extendedId, { deletedAt: Date.now() }));

    const { isError, text } = await callTool(apiKey, "plan_meal", { recipeId, dateTime: dayAhead(1), slot: "dinner", servings: 2 });

    expect(isError).toBe(true);
    expect(text).toMatch(/no longer exists/);
    expect(await platesOf(householdId)).toEqual([]);
  });
});
