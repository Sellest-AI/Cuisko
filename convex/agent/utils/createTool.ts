import { createTool as _createTool, type ToolCtx as _ToolCtx, } from "@convex-dev/agent";
import type { Tool } from "ai";

type ToolCtx = _ToolCtx;

type Params<INPUT, OUTPUT, Ctx extends ToolCtx = ToolCtx> = Parameters<typeof _createTool<INPUT, OUTPUT, Ctx>>[0];

/**
 * A Convex tool that can also be called directly, as a function.
 *
 * The SDK's own `execute` takes `(input, options)` and reads the ctx off `this`, which the agent
 * sets when the model picks the tool. That is the right shape for a tool and the wrong shape for a
 * caller who already holds a ctx and simply wants the work done — most of ours are used both ways,
 * and a recipe is sanitized by a router action long before any model chooses to sanitize one.
 *
 * So `run` is added ALONGSIDE `execute` rather than over it. Overwriting `execute` with the raw
 * handler is the tempting version and it breaks silently: the moment the tool is listed in an
 * agent's `tools`, the SDK calls `execute(input, options)`, the model's arguments arrive in the
 * `ctx` slot, and nothing throws. Both call sites now stay correct at once.
 */
export type ToolExtended<INPUT, OUTPUT, Ctx extends ToolCtx = ToolCtx> = Tool<INPUT, OUTPUT> & {
  run: (
    ctx: Ctx,
    args: INPUT,
  ) => (OUTPUT | Promise<OUTPUT>);
};

export const createTool = <INPUT, OUTPUT, Ctx extends ToolCtx = ToolCtx>(
  args: Params<INPUT, OUTPUT, Ctx>
): ToolExtended<INPUT, OUTPUT, Ctx> => {
  const tool = _createTool<INPUT, OUTPUT, Ctx>(args);

  return Object.assign(tool, { run: args.execute }) as ToolExtended<INPUT, OUTPUT, Ctx>;
};
