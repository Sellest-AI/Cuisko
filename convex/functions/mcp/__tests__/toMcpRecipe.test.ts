import { describe, expect, test } from "vitest";

import type { RecipeDetail } from "../../recipes/loadRecipe";
import { toMcpRecipe } from "../toMcpRecipe";

/** Only what the mapper reads, plus the fields it must never carry. */
const RECIPE = {
  id: "recipe",
  title: "Curry",
  description: "A curry.",
  servings: 4,
  minutes: 30,
  userId: "author",
  sourceUrl: "https://example.com/curry",
  chef: { name: "Camille", seed: "camille" },
  ingredients: [{ name: "Rice", quantity: 200, unit: "g", emoji: "🍚", imageUrl: "https://example.com/rice.png" }],
  instructions: [
    { title: "Sauce", steps: [{ instruction: "Fry the onions.", hints: ["Keep the heat low."] }] },
    { steps: [{ instruction: "Serve.", hints: [] }] },
  ],
} as unknown as RecipeDetail;

describe("toMcpRecipe", () => {
  test("carries the recipe, and nothing that names its author or where it came from", () => {
    expect(toMcpRecipe(RECIPE)).toEqual({
      id: "recipe",
      title: "Curry",
      description: "A curry.",
      servings: 4,
      minutes: 30,
      ingredients: [{ name: "Rice", quantity: 200, unit: "g" }],
      instructions: [
        { title: "Sauce", steps: [{ instruction: "Fry the onions.", hints: ["Keep the heat low."] }] },
        { steps: [{ instruction: "Serve.", hints: [] }] },
      ],
    });
  });

  test("carries the cover and never the plate", () => {
    const recipe = toMcpRecipe({
      ...RECIPE,
      coverImageUrl: "https://example.com/cover.webp",
      plateImageUrl: "https://example.com/plate.webp",
    });

    expect(recipe.coverImageUrl).toBe("https://example.com/cover.webp");
    expect(JSON.stringify(recipe)).not.toContain("plate.webp");
  });

  test("leaves the cover absent on a recipe with none", () => {
    expect(toMcpRecipe(RECIPE)).not.toHaveProperty("coverImageUrl");
  });

  test("leaves minutes absent on a recipe with no timings, rather than saying it takes no time", () => {
    expect(toMcpRecipe({ ...RECIPE, minutes: undefined })).not.toHaveProperty("minutes");
  });
});
