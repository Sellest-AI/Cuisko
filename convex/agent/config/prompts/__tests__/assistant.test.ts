import type { Id } from "@convex/_generated/dataModel";
import { SUPPORTED_LOCALES } from "@shared/translations";
import { describe, expect, test } from "vitest";
import z from "zod/v4";

import { computeNutritionTool } from "../../../tools/computeNutrition";
import { displayTool } from "../../../tools/display";
import { searchIngredientsTool } from "../../../tools/searchIngredients";
import { searchRecipesTool } from "../../../tools/searchRecipes";
import { showButtonTool } from "../../../tools/showButton";
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
});
