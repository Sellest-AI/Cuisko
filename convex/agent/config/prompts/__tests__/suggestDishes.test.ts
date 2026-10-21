import { describe, expect, it } from "vitest";

import { suggestDishesPrompt } from "../suggestDishes";

/**
 * The constraints the catalog import asks under. Each must reach the model, and an ask without
 * them must send the prompt the import has always sent.
 */
describe("suggestDishesPrompt, constraints", () => {
  it("is the unconstrained prompt when the constraints are absent or empty", () => {
    const unconstrained = suggestDishesPrompt("indian", 8);

    expect(suggestDishesPrompt("indian", 8, {})).toBe(unconstrained);
    expect(suggestDishesPrompt("indian", 8, { seeks: [] })).toBe(unconstrained);
    expect(unconstrained).toContain("Return exactly 8 dishes.");
    expect(unconstrained).toContain("At least 2 of the 8 are vegan AS COOKED");
    expect(unconstrained).not.toContain("Every dish fits these");
  });

  it("states the time ceiling", () => {
    expect(suggestDishesPrompt("thai", 6, { time: "20" })).toContain("Ready in 20 minutes or less");
  });

  it("states each goal sought, with the threshold the recipe is measured against", () => {
    const prompt = suggestDishesPrompt("mexican", 6, { seeks: ["high-protein", "low-carb"] });

    expect(prompt).toContain("at least 20% of its calories from protein");
    expect(prompt).toContain("at most 26% of its calories from them");
  });

  it("lets the model return fewer dishes rather than one that does not fit", () => {
    const prompt = suggestDishesPrompt("mexican", 6, { seeks: ["iron-rich"] });

    expect(prompt).toContain("Return up to 6 dishes.");
    expect(prompt).not.toContain("Return exactly");
  });

  it("replaces the vegan share with the diet asked for", () => {
    const prompt = suggestDishesPrompt("italian", 8, { diet: "pescatarian" });

    expect(prompt).toContain("Every dish is pescatarian AS COOKED");
    expect(prompt).not.toContain("are vegan AS COOKED");
  });

  /** A vegan ask shown "red meat, offal" as the way to iron proposes a liver dish: a wasted import. */
  it("names the protein and iron sources the diet allows", () => {
    const vegan = suggestDishesPrompt("indian", 6, { diet: "vegan", seeks: ["iron-rich", "high-protein"] });
    const any = suggestDishesPrompt("indian", 6, { seeks: ["iron-rich"] });

    const goals = vegan.split("# Every dish fits these")[1]?.split("# Spread the list")[0];

    expect(goals).toContain("from lentils, chickpeas, tofu or dark leafy greens");
    expect(goals).not.toMatch(/meat|offal|fish|eggs/);
    expect(any).toContain("from red meat, offal");
  });

  /** The guard checks a pescatarian ask against this answer, so the model must be told to give it. */
  it("tells the model to mark a fish dish pescatarian, asked under a diet or not", () => {
    expect(suggestDishesPrompt("japanese", 6)).toContain('no meat `diet: "pescatarian"`');
    expect(suggestDishesPrompt("japanese", 6, { diet: "pescatarian" })).toContain(
      'no meat `diet: "pescatarian"`',
    );
  });

  it("keeps the vegan share when only a time or a goal is asked for", () => {
    expect(suggestDishesPrompt("italian", 8, { time: "30" })).toContain("At least 2 of the 8 are vegan AS COOKED");
  });

  it("keeps forbidding effort words in the name under a time ceiling", () => {
    expect(suggestDishesPrompt("french", 6, { time: "20" })).toContain('no effort ("express", "rapide"');
  });
});
