/**
 * A bake-off: does the verifier hold to what a caption and a transcript can prove, when it cannot
 * watch the video the recipe came from?
 *
 * ⚠️ THIS COSTS MONEY AND MINUTES — it calls OpenRouter for real. Run it by hand:
 *
 *     pnpm test:manual verifyVideoRecipe
 *
 * What is measured is the real thing: `verificationSchema`, `toRecipeVerification`,
 * `verifyVideoRecipePrompt` and `verifyVideoRecipeUserPrompt` come from the tool. The post is written
 * by hand, not read from a real reel, so each fault below is one the words prove and each trap one
 * they do not: a real transcript cannot be made to hold every case. The catalog is faked too.
 */
import { tool } from "ai";
import { describe, expect, it } from "vitest";

import { parseInstructions } from "@shared/recipes";

import { runBakeOff, type Candidate } from "../../__bench__";
import { VERIFY_TOOLS, verifyVideoRecipePrompt } from "../../config/prompts/verifyRecipe";
import { searchIngredientsInputSchema } from "../searchIngredients";
import {
  type RecipeVerification,
  toRecipeVerification,
  verificationSchema,
  verifyVideoRecipeUserPrompt,
} from "../verifyRecipe";

const CANDIDATES: Candidate[] = [{ name: "openai/gpt-6.1-sol", modes: ["low"] }];

const LOCALE = "en" as const;

/**
 * | Case                       | Words                                 | Stored     | Verdict            |
 * | -------------------------- | ------------------------------------- | ---------- | ------------------ |
 * | orzo                       | caption 350 g, transcript silent      | 200 g      | fix to 350 g       |
 * | shallot                    | caption 1 shallot, softened in pan    | powder row | fix: wrong row     |
 * | capers                     | said going into the pan               | missing    | add                |
 * | lemon                      | caption 2, said 2                     | 1          | fix to 2           |
 * | olive oil                  | caption 3 tbsp                        | 9 tsp      | keep: same amount  |
 * | ground cumin               | never said or written                 | 1 tsp      | keep: on screen    |
 * | chicken stock              | caption 700 ml, said 800 ml           | 750 ml     | keep: words differ |
 * | oven                       | said 200 °C only                      | 180 °C     | keep: a dial       |
 * | feta, the pan              | "you could add feta", a partner's pan | absent     | keep absent        |
 */
const STORED = {
  title: "One-pan lemon chicken orzo",
  description: "Golden chicken thighs baked over lemony orzo in a single pan.",
  servings: 4,
  difficulty: 2 as const,
  cuisine: "greek" as const,
  tags: [],
  equipments: [],
  timings: { preparation: 10, cooking: 35 },
  instructions: parseInstructions(`- Brown 8 chicken thighs in 9 teaspoons of olive oil with 1 teaspoon of ground cumin.
- Soften 1 shallot in the same pan.
- Stir in 200 g of orzo and the zest of 1 lemon.
- Pour in 750 ml of chicken stock and the juice of the lemon.
- Bake at 180 °C for 25 minutes.`),
  ingredients: [
    { name: "Chicken thigh", quantity: 8, unit: "pcs" as const },
    { name: "Olive oil", quantity: 9, unit: "tsp" as const },
    { name: "Ground cumin", quantity: 1, unit: "tsp" as const },
    { name: "Shallot powder", quantity: 1, unit: "pcs" as const },
    { name: "Orzo", quantity: 200, unit: "g" as const },
    { name: "Lemon", quantity: 1, unit: "pcs" as const },
    { name: "Chicken broth", quantity: 750, unit: "ml" as const },
  ],
};

const POST = {
  caption: `One-pan lemon chicken orzo, serves 4 🍋
8 chicken thighs
3 tbsp olive oil
1 shallot
350 g orzo
2 lemons
700 ml chicken stock
#onepan #dinnerideas #foodtok`,
  transcript:
    "Okay so we brown the chicken thighs really well, skin side down. Soften the shallot in that fat. Then the orzo goes straight in with " +
    "the zest of two lemons, and now a big spoon of capers goes in too, trust me. Eight hundred mil of stock, " +
    "all the lemon juice, and it goes in the oven at two hundred degrees for twenty-five minutes. You could add " +
    "some feta at the end if you like. This pan is a gift from our partner, check my profile.",
};

const CATALOG = ["Capers", "Chicken broth", "Chicken thigh", "Feta", "Ground cumin", "Lemon", "Olive oil", "Orzo", "Shallot", "Shallot powder"];

const TOOLS = {
  [VERIFY_TOOLS.searchIngredients]: tool({
    description: "Looks up ingredients in this app's catalog, several names at once, best match first.",
    inputSchema: searchIngredientsInputSchema,
    execute: async ({ queries }) =>
      queries.map((query) => ({
        query,
        ingredients: CATALOG.filter((name) => name.toLowerCase().includes(query.toLowerCase().trim())).map((name) => ({ name })),
      })),
  }),
};

const CRITERIA = [
  "Did it fix what the words prove? Orzo 350 g, the caption's and never contradicted. Two lemons, on " +
  "both sides. Capers added, said going into the pan. The shallot line relinked from \"Shallot powder\" to \"Shallot\".",
  "Did it leave alone what the words do not prove? Olive oil stays 9 tsp, already the caption's 3 tbsp. " +
  "Ground cumin stays, though nobody names it. The stock stays 750 ml and the oven 180 °C.",
  "Did it keep out what was only mentioned? No feta, no partner's pan, and no word about the video.",
];

const _line = ({ ingredients }: NonNullable<RecipeVerification["recipe"]>, food: string) =>
  ingredients.find(({ name }) => name.toLowerCase().includes(food));

const CHECKS = ({ recipe }: RecipeVerification) => {
  if (!recipe) return ["returned no recipe: every fault left standing"];

  const steps = recipe.instructions.flatMap((group) => group.steps.map(({ instruction }) => instruction)).join("\n");
  const oil = _line(recipe, "olive oil");
  const stock = _line(recipe, "broth") ?? _line(recipe, "stock");

  return [
    ...(_line(recipe, "orzo")?.quantity === 350 ? [] : ["orzo is not the caption's 350 g"]),
    ...(_line(recipe, "lemon")?.quantity === 2 ? [] : ["lemon is not the 2 both sources state"]),
    ...(_line(recipe, "caper") ? [] : ["the capers said going into the pan are not listed"]),
    ...(_line(recipe, "shallot")?.name.toLowerCase() === "shallot" ? [] : ["the shallot is still linked to the wrong row"]),
    ...(oil?.quantity === 9 && oil.unit === "tsp" ? [] : ["olive oil rewritten, though 9 tsp was already 3 tbsp"]),
    ...(_line(recipe, "cumin") ? [] : ["ground cumin removed, though silence proves nothing"]),
    ...(stock?.quantity === 750 ? [] : ["stock changed, though caption and transcript disagree"]),
    ...(/\b180\b/.test(steps) ? [] : ["oven changed on a spoken number alone"]),
    ...(_line(recipe, "feta") ? ["feta listed, though it was only suggested"] : []),
    ...(/\b(video|creator|caption|transcript|partner)\b/i.test(JSON.stringify(recipe)) ? ["the recipe mentions the video"] : []),
  ];
};

describe("verifyRecipe on a video — model bake-off", () => {
  it("ranks the field", async () => {
    const result = await runBakeOff({
      title: "verifyVideoRecipe",
      candidates: CANDIDATES,
      system: verifyVideoRecipePrompt(LOCALE),
      prompt: verifyVideoRecipeUserPrompt({ stored: STORED, post: POST }),
      answer: { schema: verificationSchema, parse: toRecipeVerification, check: CHECKS },
      tools: TOOLS,
      provider: { sort: "throughput" },
      criteria: CRITERIA,
      runs: 3,
    });

    // Guards the benchmark, not the models: an empty table is a broken key or a dead slug.
    expect(result.ok).toBeGreaterThan(0);
  });
});
