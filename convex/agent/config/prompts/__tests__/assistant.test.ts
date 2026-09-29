import type { Id } from "@convex/_generated/dataModel";
import { SUPPORTED_LOCALES } from "@shared/translations";
import { describe, expect, test } from "vitest";
import z from "zod/v4";

import { computeNutritionTool } from "../../../tools/computeNutrition";
import { displayTool } from "../../../tools/display";
import { searchIngredientsTool } from "../../../tools/searchIngredients";
import { searchRecipesTool } from "../../../tools/searchRecipes";
import { showButtonTool } from "../../../tools/showButton";
import { showSubstitutionsTool } from "../../../tools/showSubstitutions";
import { assistantPrompt } from "../assistant";

/**
 * Everything the assistant model reads before it answers: the prompt, and each tool's description
 * and input schema. A model copies the register it is written to, so a dash or an emoji anywhere
 * in here comes back in the cook's answers. It happened: an example "🥕 a carrot" put a carrot in
 * every reply, and a prompt written with em dashes answered with em dashes.
 */
const _everythingTheModelReads = (): string[] => {
  const tools = [
    searchRecipesTool({ userId: "user" as Id<"users">, locale: "fr" }),
    searchIngredientsTool({ locale: "fr" }),
    computeNutritionTool({ locale: "fr" }),
    displayTool,
    showButtonTool,
    showSubstitutionsTool,
  ];

  return [
    ...SUPPORTED_LOCALES.map((locale) => assistantPrompt(locale)),
    // The SDK also accepts a description built per call; this test could not read one, so it refuses it.
    ...tools.map((tool) => {
      if (typeof tool.description !== "string") throw new Error("expected a plain string description");
      return tool.description;
    }),
    ...tools.map((tool) => JSON.stringify(z.toJSONSchema(tool.inputSchema as z.ZodType))),
  ];
};

describe("what the assistant model reads", () => {
  test("holds no em dash and no en dash", () => {
    for (const text of _everythingTheModelReads()) expect(text).not.toMatch(/[—–]/);
  });

  test("holds no emoji", () => {
    for (const text of _everythingTheModelReads()) expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("substitutions", () => {
  /**
   * "What can I replace milk with in a gratin" came back as a bullet list and no card: the prompt
   * said to call the tool for a swap, and bullets for "a few options", and alternatives read as
   * options. Both halves are pinned: an open question is swaps, and swaps are never bullets.
   */
  test("sends the alternatives to an open question to the card, never to a list", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const prompt = assistantPrompt(locale);

      expect(prompt).toMatch(/"what can I use instead of\s+milk" is one swap per alternative you suggest/);
      expect(prompt).toMatch(/Ingredient swaps are never a\s+list in your text: they go to showSubstitutions/);
      expect(prompt).toMatch(/Do not list the swaps back in your answer, not as bullets/);
    }
  });

  /**
   * The same question, once the tool was wired: "milk" found only oat, almond and coconut milk, and
   * "if an ingredient is not found, text only" sent every swap to the text. The catalog holds
   * "Whole milk"; the model is sent back to search for it before giving up.
   */
  test("searches again with the catalog's name before giving a swap in text", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(assistantPrompt(locale)).toMatch(
        /When the ingredient itself is not\s+in the results, search again once with the name the catalog would use/,
      );
    }
  });

  /** The extra step after a card wrote the same paragraph a second time. */
  test("never repeats itself after showing something", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(assistantPrompt(locale)).toMatch(/Never repeat or\s+rephrase what you already wrote in this answer/);
    }
  });
});

describe("recipes", () => {
  /**
   * "Tu as une recette de ramen au kimchi ?" with no ramen in the catalog: the prompt said to answer
   * without cards, and a cook asking for a dish is better served by the nearest one the app has,
   * shown, and said plainly to be the nearest. Both halves are pinned: the miss is said first, and
   * the closest recipes are still shown.
   */
  test("says the dish asked for is missing, then shows the closest ones", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const prompt = assistantPrompt(locale);

      expect(prompt).toMatch(/say so plainly first,\s+then show the\s+closest recipes you found/);
      expect(prompt).toMatch(/one more call with the\s+dishes closest to it and the dishes what they have makes/);
      expect(prompt).toMatch(/Never present a close recipe as the one they asked\s+for/);
      expect(prompt).not.toMatch(/without calling display|answer without cards/);
    }
  });

  /**
   * "Qu'est-ce que je peux cuisiner ce soir ?" got cards and nothing after them, and cooks did not
   * know a card opens: the steps, the ingredients, and planning it, which is what fills the
   * shopping list. The answer ends by saying so, and the "nothing more" rule no longer stops it.
   */
  test("ends with an invitation to open a card and plan it", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const prompt = assistantPrompt(locale);

      expect(prompt).toMatch(/end your answer with one short sentence inviting them to tap a\s+recipe/);
      expect(prompt).toMatch(/plan it for the day they want/);
      expect(prompt).toMatch(/shopping list/);
      expect(prompt).toMatch(/The\s+invitation after recipe cards is not a repeat/);
    }
  });

  /**
   * Two different questions: "je veux des lasagnes ce soir" asks about a dish, and is answered by
   * the card and the invitation to plan it; "aide-moi à planifier ma semaine" asks about planning,
   * and is answered by the planning button. The week never gets the invitation.
   */
  test("a request to plan the week ends with the button, not the invitation", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const prompt = assistantPrompt(locale);

      expect(prompt).toMatch(/call showButton with destination "planning"/);
      expect(prompt).toMatch(/request to plan several days or their week: that answer ends with the\s+planning button instead, and never with this invitation/);
    }
  });
});

describe("the cellar brief", () => {
  /**
   * The dates are estimates from `shelfLifeDays`, not read off a packet, so the model may use them
   * to choose and never say them. Pinned per locale, since the prompt is built per locale.
   */
  test("tells the model to use expiry dates only to choose, and never to mention them", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const prompt = assistantPrompt(locale);

      expect(prompt).toContain("Expiry dates are rough estimates. Use them only to decide what to cook first.");
      expect(prompt).toMatch(/Never mention a\s+date, never say something is expiring or going off/);
      expect(prompt).toContain("never make the person feel rushed");
    }
  });

  /**
   * An empty cellar once got an answer with no recipes: "prefer what they have" read as "only what
   * they have". The cellar ranks recipes, it never withholds them.
   */
  test("still asks for recipes when the cellar is empty", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const prompt = assistantPrompt(locale);

      expect(prompt).toMatch(/What they have decides which recipes come first, never whether they get any/);
      expect(prompt).toMatch(/When the cellar is\s+empty, or nothing in it makes a dish, still search and show recipes/);
      expect(prompt).toMatch(/A recipe\s+that needs food they do not have still fits\./);
    }
  });
});
