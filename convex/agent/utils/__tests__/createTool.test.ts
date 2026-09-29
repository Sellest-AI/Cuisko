import type { ToolCtx } from "@convex-dev/agent";
import { describe, expect, it } from "vitest";
import * as z from "zod/v4";

import { createTool } from "../createTool";

const _ctx = {} as ToolCtx;

/** A tool that hands back what it was given, so the test reads what `execute` received. */
const _echo = () =>
  createTool({
    description: "echo",
    inputSchema: z.object({ ids: z.array(z.string()).optional(), note: z.string() }),
    ctx: _ctx,
    execute: async (_ctx, input) => input,
  });

/**
 * Every tool reads its input through `parseToolInput` before its own code runs, so no tool writes a
 * cleaner of its own. Pinned on both doors: the one the model calls, and `run`, which the manual
 * bake-offs call with the model's raw arguments.
 */
describe("createTool", () => {
  it("hands the model's call to the tool with its stand-ins taken out", async () => {
    const echoed = await _echo().execute!({ ids: [""], note: "hi" }, { toolCallId: "1", messages: [], context: {} });

    expect(echoed).toEqual({ note: "hi" });
  });

  it("does the same through run", async () => {
    expect(await _echo().run(_ctx, { ids: ["a", ""], note: "hi" })).toEqual({ ids: ["a"], note: "hi" });
  });

  it("throws on a call the schema refuses, for the model to read", async () => {
    await expect(async () => _echo().run(_ctx, { note: 3 } as never)).rejects.toThrow();
  });
});
