import { createTool as _createTool, type ToolCtx as _ToolCtx, } from "@convex-dev/agent";
import type { Tool } from "ai";

type ToolCtx = _ToolCtx;

type Params<INPUT, OUTPUT, Ctx extends ToolCtx = ToolCtx> = Parameters<typeof _createTool<INPUT, OUTPUT, Ctx>>[0];

export type ToolExtended<INPUT, OUTPUT, Ctx extends ToolCtx = ToolCtx> = Tool<INPUT, OUTPUT> & {
  execute: (
    ctx: Ctx,
    args: INPUT,
  ) => (OUTPUT | Promise<OUTPUT>);
};

export const createTool = <INPUT, OUTPUT, Ctx extends ToolCtx = ToolCtx>(
  args: Params<INPUT, OUTPUT, Ctx>
): ToolExtended<INPUT, OUTPUT, Ctx> => {
  const tool = _createTool<INPUT, OUTPUT, Ctx>(args);

  (tool as any).execute = args.execute;

  return tool as ToolExtended<INPUT, OUTPUT, Ctx>;
};
