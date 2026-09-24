import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Locale } from "@shared/translations";
import z from "zod/v4";

import { createTool } from "../utils";

/**
 * The catalog, as the assistant reaches it: a few dish names in, a handful of real recipes per name
 * out.
 *
 * **The tool returns rows, and the model never composes one.** Its input is a search term — free
 * text, which is the one thing a model is reliable at producing — and the ids in its output come
 * from `searchForUser`, not from the model. The model then CARRIES the ones it chooses to `display`,
 * which re-checks each before anything is stored (ADR 0010). The cook sees none of this output
 * directly: the client reads only the call's state, for its status line.
 *
 * **Several names per call, because the model thinks in alternatives.** Asked for dinner with
 * beef and tomatoes, it has "bolognaise" and "chili con carne" in mind at once; one term per call
 * made that a round trip per name, each re-reading the whole conversation. Each name comes back
 * beside what it found, so the model can tell which idea found nothing and which found five.
 *
 * **A list of `{ query, recipes }`, never an object keyed by the name.** The output is stored in
 * the message document, and Convex refuses a field name that is not ASCII: keyed by name,
 * "gnocchis poêlées" failed the whole turn.
 *
 * Titles travel beside the ids so the model can choose — it cannot pick the two recipes worth
 * showing from a list of opaque strings. They are paired inside
 * one object rather than returned as two arrays, for the reason `translateRecipe` pairs its locale
 * with its recipe: parallel arrays are one off-by-one away from labelling the wrong row, and
 * nothing would throw.
 */

/**
 * How many recipes one search hands back.
 *
 * Small on purpose: the model reads these and pays for them by the token, and one call may carry
 * several names. Five per name is enough to choose from; twenty-four, which is what
 * `searchForUser` returns to a grid by default, is a shortlist the model would have to shortlist.
 */
const SEARCH_LIMIT = 5;

/** How many names one call may search. With `SEARCH_LIMIT`, it caps what one call hands back. */
const MAX_QUERIES = 5;

const _inputSchema = z.object({
  queries: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_QUERIES)
    .describe(
      "The names of the DISHES to look for, or single ingredients, one per entry. " +
      "Search what you would call each recipe ([\"bolognaise\", \"chili con carne\"]), never " +
      "the shopper's whole question.",
    ),
});

/**
 * What the tool hands back: for each name searched, the recipes it found, best match first. What
 * the model chooses from, and carries on to `display`.
 */
export type FoundRecipes = { query: string; recipes: { id: Id<"recipes">; title: string }[] }[];

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
      "Searches this app's recipe catalog for several dish names or ingredients at once, and " +
      "returns, for each name searched, the matching recipes, best match first. The cook does " +
      "not see these results: pass the ones worth showing to display. A name that matches " +
      "nothing has an empty list: say so rather than inventing a recipe.",
    inputSchema: _inputSchema,
    execute: async (ctx, { queries }): Promise<FoundRecipes> => {
      // A name the model repeats, or pads with spaces, would be the same read twice.
      const terms = [...new Set(queries.map((query) => query.trim()))].filter(Boolean);

      return Promise.all(
        terms.map(async (query) => {
          const recipes = await ctx.runQuery(internal.router.recipes.search._internal, {
            query,
            userId,
            locale,
            limit: SEARCH_LIMIT,
          });
          return { query, recipes: recipes.map(({ id, title }) => ({ id, title })) };
        }),
      );
    },
  });
