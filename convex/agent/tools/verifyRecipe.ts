import { Output } from "ai";
import * as z from "zod/v4";

import { internal } from "@convex/_generated/api";
import type { RecipeDraft } from "@convex/lib/scraping/toRecipeDraft";
import { SUPPORTED_LOCALES } from "@shared/translations";
import { retryPromise } from "@shared/helpers";

import { createTool, parseModelOutput, providerSchema, wrapAgent } from "../utils";
import { verifierAgent } from "../agents";
import { VERIFY_TOOLS, verifyRecipePrompt } from "../config/prompts/verifyRecipe";
import { modelRecipeSchema, type SanitizedRecipe, toSanitizedRecipe } from "./sanitizeRecipe";
import { searchIngredientsTool } from "./searchIngredients";

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
 * What the model is shown: the stored recipe first, because it is the thing being corrected, then
 * the page it is checked against.
 *
 * Takes the page already scraped rather than the URL, so it stays pure: the bake-off
 * (`verifyRecipe.manual.test.ts`) scores this exact prompt against a fixed page, without a fetch.
 *
 * `stored` goes through `modelRecipeSchema.parse` on its way in, which strips what is not the
 * model's to see — the row's `userId` rides along from `toModelRecipe`.
 */
export const verifyRecipeUserPrompt = ({ stored, source }: { stored: z.infer<typeof modelRecipeSchema>; source: ScrapedPage }) =>
  [
    `The recipe as the app stored it:\n${JSON.stringify(modelRecipeSchema.parse(stored), null, 2)}`,
    `The page it was imported from.`,
    `Title: ${source.title}`,
    source.description && `Description: ${source.description}`,
    `Serves: ${source.servings}`,
    `Ingredients:\n${source.ingredients}`,
    `Instructions:\n${source.instructions}`,
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
 * `generateText` with an `output`, not `generateObject`: the verifier is handed the catalog search,
 * and only a text generation can call a tool before it answers. It looks a name up — "chicken
 * breast" — and, when the catalog would not find it under that name, picks the one it would, since
 * the name it writes is the name `resolveRecipeIngredients` matches to a row. The steps are capped
 * by the agent's `maxSteps`; a model still searching at the cap leaves no answer, which throws.
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

    const result = await retryPromise(() =>
      wrapAgent(verifierAgent).generateText(
        ctx,
        {},
        {
          system: verifyRecipePrompt(locale),
          prompt: verifyRecipeUserPrompt({ stored, source }),
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
