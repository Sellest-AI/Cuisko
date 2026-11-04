import { getAuthUserId } from "@convex-dev/auth/server";
import { createTool, McpServer } from "@convex-dev/mcp";
import { ConvexError, v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_QUERIES, searchRecipesTool } from "./agent/tools/searchRecipes";
import { env } from "./env";
import { planPlate } from "./functions/mcp/planPlate";
import { runTool } from "./functions/mcp/runTool";
import { toMcpRecipe } from "./functions/mcp/toMcpRecipe";
import { withImage } from "./functions/mcp/withImage";
import type { Locale } from "./schema/i18n";
import { vMealSlot } from "./schema/households";

/**
 * Cuisko as a remote MCP server: what an outside agent, such as Claude, can do for a cook.
 *
 * A mount point, like `auth.ts`, and so outside the `router/` export grammar: the names exported
 * here are the component's own. The cook comes from the verified token (`user.userId`), never from
 * a tool's arguments, and a handler runs in an HTTP action with no `ctx.auth` of its own. Every
 * handler goes through `runTool`.
 */

/**
 * The language every tool reads in. The server stores no locale and an agent has none to send, so
 * tools ask for English and the agent translates for the cook: every recipe is kept in both.
 */
const MCP_LOCALE: Locale = "en";

const tool = createTool<Id<"users">>();

/** Annotated: tools reference `internal`, and this file exports functions, so inference would cycle. */
export const mcp: McpServer<Id<"users">> = new McpServer(components.mcp, {
  name: "cuisko",
  title: "Cuisko",
  version: "1.0.0",
  instructions:
    "Find recipes in Cuisko, read the ones you suggest with get_recipe, and plan them on the meals of the cook's week.",
  consentUrl: `${env.SITE_URL}/connect`,
  deviceFlow: false,
  scopes: {
    "recipes:read": "See Cuisko's recipes",
    "plans:write": "Plan meals on your household's week",
  },
  tools: {
    search_recipes: tool({
      description:
        `Searches Cuisko's recipe catalog for up to ${MAX_QUERIES} dish names or ingredients at once. ` +
        "Write every name in English, whatever language the cook speaks. Answers with each name's " +
        "matches, best first, in English: translate them for the cook. A match is only an id and a " +
        "title, so call get_recipe on each recipe you suggest, and describe it from that answer rather " +
        "than from its title. An empty list means nothing matched: say so rather than inventing a recipe.",
      args: { queries: v.array(v.string()) },
      returns: v.object({
        results: v.array(
          v.object({
            query: v.string(),
            recipes: v.array(v.object({ id: v.string(), title: v.string() })),
          }),
        ),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      scope: "recipes:read",
      handler: (ctx, { queries }, user) =>
        runTool(ctx, user, async ({ userId }) => ({
          results: await searchRecipesTool({ userId, locale: MCP_LOCALE }).run(ctx, { queries }),
        })),
    }),

    get_recipe: tool({
      description:
        "Reads one recipe in full, in English: its description, time, ingredients and steps, with a " +
        "photo of the dish attached as an image. Pass an id from search_recipes.",
      args: { id: v.string() },
      returns: v.object({
        id: v.string(),
        title: v.string(),
        description: v.string(),
        servings: v.number(),
        minutes: v.optional(v.number()),
        coverImageUrl: v.optional(v.string()),
        ingredients: v.array(v.object({ name: v.string(), quantity: v.number(), unit: v.string() })),
        instructions: v.array(
          v.object({
            title: v.optional(v.string()),
            steps: v.array(v.object({ instruction: v.string(), hints: v.array(v.string()) })),
          }),
        ),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      scope: "recipes:read",
      handler: (ctx, { id }, user) =>
        runTool(ctx, user, async () => {
          const [missing] = await ctx.runQuery(internal.router.recipes.missingIds._internal, { ids: [id] });
          if (missing !== undefined) {
            throw new ConvexError(`This recipe id does not exist: ${id}. Pass only ids search_recipes returned, copied exactly.`);
          }

          const recipe = toMcpRecipe(
            await ctx.runQuery(internal.router.recipes.getOne._internal, { locale: MCP_LOCALE, id: id as Id<"recipes"> }),
          );

          return withImage(recipe, recipe.coverImageUrl);
        }),
    }),

    plan_meal: tool({
      description:
        "Plans one recipe on one meal of the cook's week, for a number of people, and adds what their " +
        "kitchen lacks to the grocery list. Call it when the cook asked for it or said yes. Pass a " +
        "recipe id from search_recipes. dateTime is when the meal is, in ISO 8601 with the cook's UTC " +
        "offset on that day, like 2026-11-05T19:30:00+01:00: ask the cook rather than guess the " +
        "offset. If the answer is `occupied`, nothing was planned: if `current.recipeId` is the one you " +
        "passed, it is already planned; otherwise tell the cook which dish holds the meal and call " +
        "again with replace only on a yes. Tell the cook about `replaced`, which is the dish that went.",
      args: {
        recipeId: v.string(),
        dateTime: v.string(),
        slot: vMealSlot,
        servings: v.number(),
        replace: v.optional(v.boolean()),
      },
      returns: v.object({
        status: v.union(v.literal("planned"), v.literal("occupied")),
        date: v.string(),
        slot: vMealSlot,
        replaced: v.optional(v.object({ recipeId: v.string(), title: v.string(), servings: v.number() })),
        current: v.optional(
          v.object({ recipeId: v.optional(v.string()), title: v.string(), servings: v.number() }),
        ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      scope: "plans:write",
      handler: (ctx, args, user) => runTool(ctx, user, (cook) => planPlate(ctx, cook, MCP_LOCALE, args)),
    }),
  },
});

/**
 * The consent page and its connections list, on the showcase website. The caller comes from `getAuthUserId`,
 * inside the component. `createApiKey` and `findAuthRequest` stay unexported: cooks get no API keys,
 * and the device flow is off.
 */
export const { getAuthRequest, authorize, listConnections, revokeConnection } = mcp.api({ getUserId: getAuthUserId });

/** Deploy credentials only: the smoke check and the tests. */
export const { createApiKeyForUser } = mcp.internalApi();
