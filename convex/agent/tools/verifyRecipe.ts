import type { ToolCtx } from "@convex-dev/agent";
import { Output } from "ai";
import * as z from "zod/v4";

import { internal } from "@convex/_generated/api";
import type { RecipeDraft } from "@convex/lib/scraping/toRecipeDraft";
import { searchTerms } from "@shared/ingredientMatch";
import { type Locale, SUPPORTED_LOCALES } from "@shared/translations";
import { retryPromise } from "@shared/helpers";

import { createTool, parseModelOutput, providerSchema, wrapAgent } from "../utils";
import { verifierAgent } from "../agents";
import { VERIFY_TOOLS, verifyRecipePrompt } from "../config/prompts/verifyRecipe";
import { modelRecipeSchema, type SanitizedRecipe, toSanitizedRecipe } from "./sanitizeRecipe";
import { type FoundIngredient, searchIngredients, searchIngredientsTool } from "./searchIngredients";

/**
 * What the verifier found: the fixes, and the recipe they produce — or `null` when the stored one
 * already matches its page.
 *
 * `recipe` is `null` rather than the stored recipe sent back, because "nothing to fix" must not
 * cost a write: the caller reads `null` as "leave the row alone", and a recipe echoed back would be
 * persisted, re-linked and re-translated for nothing.
 */
export type RecipeVerification = {
  corrections: string[];
  recipe: SanitizedRecipe | null;
};

/**
 * The shape the model is constrained to. `recipe` reuses `modelRecipeSchema` whole, so a corrected
 * recipe is held to every vocabulary a sanitized one is — and a field added there reaches the
 * verifier without anyone remembering to.
 *
 * `.nullable()` alone on `recipe`, not `.optional()`: `parseModelOutput` keeps a bare nullable's
 * `null` as a value, and a model that writes `"none"` there is read as `null` too — "no fix", which
 * is the answer that costs nothing if it is wrong.
 */
export const verificationSchema = z.object({
  corrections: z.array(z.string()).describe(
    "One short sentence per fix: what was wrong, and what it is now. Empty when nothing was wrong.",
  ),
  recipe: modelRecipeSchema.nullable().describe(
    "The whole corrected recipe when there is at least one correction. null when there is none.",
  ),
});

/**
 * The model's answer as a `RecipeVerification`, the recipe through the same parser a sanitize uses.
 *
 * Corrections with no recipe throw. `parseModelOutput` reads a nested recipe it cannot validate —
 * a cuisine outside the list, a missing field — as absent, the same as `null`; left alone, a
 * verifier that found three fixes and wrote them into a broken recipe would be reported to the
 * admin as "nothing to fix".
 *
 * A recipe with no corrections is read as nothing to fix. The prompt forbids a rewrite for wording
 * alone, and one that named no fault would be saved, re-linked and shown to the admin as nothing.
 */
export const toRecipeVerification = (raw: unknown): RecipeVerification => {
  const { corrections, recipe } = parseModelOutput(verificationSchema, raw);

  if (!corrections.length) return { corrections, recipe: null };

  if (!recipe) throw new Error("The verifier listed corrections but returned no recipe that could be read");

  return { corrections, recipe: toSanitizedRecipe(recipe) };
};

export const verifyRecipeInputSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES).describe("The language the app shows the recipe in, and the one to write it in."),
  stored: modelRecipeSchema.describe("The recipe as the app stored it."),
  url: z.string().describe("The canonical address of the page the recipe was imported from."),
});

/** The page as the scraper reads it — the editor draft `importOneNode` returns, minus the URL. */
type ScrapedPage = Omit<RecipeDraft, "sourceUrl">;

/**
 * The catalog rows found for each of the page's ingredient lines, best match first. Only the
 * names: the verifier picks a row by what it is called, and nutrition it never reads is tokens it
 * pays for on every line.
 */
export type PageCatalog = { line: string; rows: Pick<FoundIngredient, "name" | "aliases">[] }[];

/**
 * Each ingredient line of the page, and what the catalog index is asked for it: the line reduced
 * by `searchTerms`, because "2 small garlic cloves finely grated" matches no row while its
 * identifying words do. A blank line has no query, and is left out.
 */
export const pageIngredientQueries = (ingredients: string) =>
  ingredients
    .split("\n")
    .map((line) => ({ line: line.trim(), query: searchTerms(line) }))
    .filter(({ line, query }) => line && query);

/**
 * The page's lines searched before the model runs, so its first step is the answer rather than a
 * search for names the page already holds. One query per line, all at once — no model call in it.
 *
 * Searched in the app's locale, like the tool. A page in another language finds little there; the
 * model is told an empty line may be that, and searches it by its translated name.
 */
const _searchPage = async (ctx: ToolCtx, { locale, ingredients }: { locale: Locale; ingredients: string }): Promise<PageCatalog> => {
  const lines = pageIngredientQueries(ingredients);
  const found = await searchIngredients(ctx, { locale, queries: lines.map(({ query }) => query) });
  const byQuery = new Map(found.map(({ query, ingredients: rows }) => [query, rows]));

  return lines.map(({ line, query }) => ({
    line,
    rows: (byQuery.get(query) ?? []).map(({ name, aliases }) => ({ name, ...(aliases && { aliases }) })),
  }));
};

const _catalogLine = ({ line, rows }: PageCatalog[number]) =>
  `- "${line}": ${rows.length
    ? rows.map(({ name, aliases }) => (aliases?.length ? `${name} (also: ${aliases.join(", ")})` : name)).join("; ")
    : "nothing found"}`;

/**
 * What the model is shown: the stored recipe first, because it is the thing being corrected, then
 * the page it is checked against, then the catalog rows the page's lines found.
 *
 * Takes the page already scraped and searched rather than the URL, so it stays pure: the bake-off
 * (`verifyRecipe.manual.test.ts`) scores this exact prompt against a fixed page, without a fetch.
 *
 * `stored` goes through `modelRecipeSchema.parse` on its way in, which strips what is not the
 * model's to see — the row's `userId` rides along from `toModelRecipe`.
 */
export const verifyRecipeUserPrompt = ({ stored, source, catalog }: {
  stored: z.infer<typeof modelRecipeSchema>;
  source: ScrapedPage;
  catalog: PageCatalog;
}) =>
  [
    `The recipe as the app stored it:\n${JSON.stringify(modelRecipeSchema.parse(stored), null, 2)}`,
    `The page it was imported from.`,
    `Title: ${source.title}`,
    source.description && `Description: ${source.description}`,
    `Serves: ${source.servings}`,
    `Ingredients:\n${source.ingredients}`,
    `Instructions:\n${source.instructions}`,
    catalog.length && `The catalog, already searched for each of the page's ingredient lines, best match first:\n${catalog.map(_catalogLine).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

/**
 * A stored recipe checked against the page it came from, by a stronger pass than the one that
 * wrote it, and corrected where it got the page wrong.
 *
 * The page is scraped here, from the URL, through `importOneNode._internal`: the scraper needs Node
 * and this tool runs in the Convex runtime, so it is reached as an action rather than imported.
 * A page that cannot be read throws its own `UNREADABLE_PAGE` before any token is spent.
 *
 * Every page line is searched in the catalog before the model runs (`_searchPage`), and the rows go
 * in the prompt: the names it writes are the names `resolveRecipeIngredients` matches to a row, and
 * a search it would otherwise open with costs a whole step the admin waits through.
 *
 * `generateText` with an `output`, not `generateObject`: the verifier still holds the catalog
 * search, for the names the page's lines did not find — a food only the method adds, a line whose
 * rows are all another product — and only a text generation can call a tool before it answers. The
 * steps are capped by the agent's `maxSteps`; a model still searching at the cap leaves no answer,
 * which throws.
 *
 * The search runs in the app's locale, the one the stored recipe was read in, because that is the
 * language its names are written in and the catalog index each locale is searched by. Not the
 * recipe's original language: see `verifyOne`'s @limitation.
 *
 * Nothing is written down, for the reason `sanitizeRecipe` gives: this is a transformation, not a
 * conversation.
 */
export const verifyRecipe = createTool({
  description:
    "Scrape the page a stored recipe was imported from, check the recipe against it, and return " +
    "the corrected recipe with the list of corrections — or no recipe when nothing was wrong.",
  inputSchema: verifyRecipeInputSchema,
  execute: async (ctx, { locale, stored, url }): Promise<RecipeVerification> => {
    const source = await ctx.runAction(internal.router.recipes.importOneNode._internal, { url });
    const catalog = await _searchPage(ctx, { locale, ingredients: source.ingredients });

    const result = await retryPromise(() =>
      wrapAgent(verifierAgent).generateText(
        ctx,
        {},
        {
          system: verifyRecipePrompt(locale),
          prompt: verifyRecipeUserPrompt({ stored, source, catalog }),
          tools: { [VERIFY_TOOLS.searchIngredients]: searchIngredientsTool({ locale }) },
          output: Output.object({ schema: providerSchema(verificationSchema) }),
          // 2, not the 3 the other tools use: with the 2 attempts below, at most 6 calls of a model
          // the admin waits on for up to a minute and a half each.
          maxRetries: 2,
        },
        { storageOptions: { saveMessages: "none" } },
      ), 2);

    return toRecipeVerification(result.output);
  },
});
