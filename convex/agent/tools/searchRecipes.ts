import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Locale } from "@shared/translations";
import z from "zod/v4";

import { createTool } from "../utils";

/**
 * The catalog, as the assistant reaches it: a dish name in, a handful of real recipes out.
 *
 * **The tool returns rows, and the model never composes one.** Its input is a search term — free
 * text, which is the one thing a model is reliable at producing — and the ids in its output come
 * from `searchForUser`, not from the model. So ADR 0010 holds in the direction that matters: no
 * `v.id()` is ever asked for, and nothing downstream reads an id the model wrote. The ids exist in
 * the output because the CLIENT reads them off the stored tool result to draw the cards; the model
 * is told, in `prompts/assistant.ts`, not to repeat them back.
 *
 * Titles travel beside the ids for the model's benefit alone — it has to say one useful sentence
 * about what it found, and it cannot do that from a list of opaque strings. They are paired inside
 * one object rather than returned as two arrays, for the reason `translateRecipe` pairs its locale
 * with its recipe: parallel arrays are one off-by-one away from labelling the wrong row, and
 * nothing would throw.
 */

/**
 * How many recipes one search hands back.
 *
 * Small on purpose, and the number is bounded by two different things at once. The model reads
 * these and pays for them by the token, and the shopper sees them as a horizontal row of cards on
 * a phone — five is already a scroll, and twenty-four, which is what `searchForUser` returns to a
 * grid by default, would be an answer nobody reads.
 */
const SEARCH_LIMIT = 5;

const _inputSchema = z.object({
  query: z
    .string()
    .describe(
      "The name of a DISH to look for, or a single ingredient. " +
      "Search what you would call the recipe — \"bolognaise\", \"chili con carne\", \"tarte au " +
      "citron\" — never the shopper's whole question.",
    ),
});

/** What the tool hands back: what the model reads, and what the client draws. */
export type FoundRecipes = {
  recipes: { id: Id<"recipes">; title: string }[];
};

type Caller = {
  /** Whose ranking this is. The caller's own recipes come first — see `searchForUser`. */
  userId: Id<"users">;
  /** The language the app is displaying, which decides which title index is searched. */
  locale: Locale;
};

/**
 * A factory rather than a tool, because the two things this needs are the two things a model must
 * not be able to state.
 *
 * `userId` decides whose recipes rank first, and `locale` decides which language's search index is
 * read. Taking either as a tool input would mean a model could ask for another cook's ranking, or
 * search the English index for French words because the question happened to look English. Both
 * are held by whoever starts the turn and closed over here, so the model's only say is the term.
 *
 * `createTool` rather than the SDK's, so the same search is callable as a plain function from a
 * test with no model in the loop — see `utils/createTool.ts`.
 */
export const searchRecipesTool = ({ userId, locale }: Caller) =>
  createTool({
    description:
      "Searches this app's recipe catalog by dish name or ingredient and returns matching " +
      "recipes. The app displays them to the user as cards automatically. Returns an empty list " +
      "when nothing matches — say so rather than inventing a recipe.",
    inputSchema: _inputSchema,
    execute: async (ctx, { query }): Promise<FoundRecipes> => {
      const found = await ctx.runQuery(internal.router.recipes.search._internal, {
        query,
        userId,
        locale,
        limit: SEARCH_LIMIT,
      });

      return { recipes: found.map(({ id, title }) => ({ id, title })) };
    },
  });
