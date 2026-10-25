import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { FoundWebRecipe } from "@shared/assistant";

import { findWebRecipeTool } from "../findWebRecipe";

const DISH = { fr: "hachis parmentier", en: "shepherd's pie" };

const _ctx = (answer: () => Promise<FoundWebRecipe>) => ({ runTracedAction: vi.fn(answer) });

describe("findWebRecipeTool", () => {
  /** The model's say is the dish; whose catalog and which language are the turn's. */
  it("asks the Node action for the dish, as this cook, in this cook's language", async () => {
    const tool = findWebRecipeTool({ userId: "cook" as Id<"users">, locale: "en" });
    const ctx = _ctx(async () => ({ v: 1, status: "none" }));

    const answer = await tool.run(ctx as unknown as Parameters<typeof tool.run>[0], { dish: DISH });

    expect(answer).toEqual({ v: 1, status: "none" });
    expect(ctx.runTracedAction).toHaveBeenCalledWith(internal.router.recipes.findWebRecipe._internal, {
      dish: DISH,
      locale: "en",
      userId: "cook",
    });
  });

  /** Marmiton down reaches the model as an error it reads, and it gives the old answer. */
  it("lets a failed search throw", async () => {
    const tool = findWebRecipeTool({ userId: "cook" as Id<"users">, locale: "fr" });
    const down = new ConvexError({ code: "EXTERNAL_SERVICE_ERROR" as const, message: "Marmiton could not be searched" });
    const ctx = _ctx(async () => {
      throw down;
    });

    await expect(tool.run(ctx as unknown as Parameters<typeof tool.run>[0], { dish: DISH })).rejects.toBe(down);
  });
});
