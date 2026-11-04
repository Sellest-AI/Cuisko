import type { ToolCtx } from "@convex-dev/mcp";
import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";
import * as z from "zod/v4";

import type { Id } from "@convex/_generated/dataModel";

import { runTool } from "../runTool";

const enforce = vi.hoisted(() => vi.fn());
vi.mock("../../rateLimits/enforceRateLimit", () => ({ enforceRateLimit: enforce }));

const COOK = { userId: "cook" as Id<"users">, role: "USER", householdId: "home" as Id<"households"> };
const USER = { userId: COOK.userId };
const CTX = { runQuery: async () => COOK } as unknown as ToolCtx;

describe("runTool", () => {
  test("hands the resolved cook to the tool, after spending the limit", async () => {
    enforce.mockReset();

    expect(await runTool(CTX, USER, async ({ householdId }) => householdId)).toBe("home");
    expect(enforce).toHaveBeenCalledWith(expect.objectContaining({ userId: "cook", user: { role: "USER" } }), "mcpCall");
  });

  test("a refusal stops the tool before it runs, and says nothing about the limit", async () => {
    enforce.mockReset().mockRejectedValueOnce(new ConvexError({ code: "RATE_LIMITED" }));
    const tool = vi.fn();

    await expect(runTool(CTX, USER, tool)).rejects.toThrow("Too many calls to Cuisko. Stop and try again in a bit.");
    expect(tool).not.toHaveBeenCalled();
  });

  test("a schema failure inside a tool is a sentence, since it is the model's own input to fix", async () => {
    enforce.mockReset();
    const failed = z.object({ servings: z.number() }).safeParse({ servings: "four" });

    await expect(
      runTool(CTX, USER, async () => {
        throw failed.error;
      }),
    ).rejects.toSatisfy((error) => error instanceof ConvexError && /^Invalid arguments/.test(error.data as string));
  });

  test("a tool's own sentence passes through as it is", async () => {
    enforce.mockReset();
    const sentence = new ConvexError("This recipe id does not exist.");

    await expect(
      runTool(CTX, USER, async () => {
        throw sentence;
      }),
    ).rejects.toBe(sentence);
  });

  test("an error nobody wrote for a model stays a plain error, which the component hides", async () => {
    enforce.mockReset();
    const bug = new TypeError("cannot read x of undefined");

    await expect(
      runTool(CTX, USER, async () => {
        throw bug;
      }),
    ).rejects.toBe(bug);
  });
});
