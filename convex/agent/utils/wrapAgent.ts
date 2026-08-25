import { Agent, ToolCtx } from "@convex-dev/agent";

export const getThreadOpts = async (ctx: ToolCtx, agent: Agent) => {
  if (ctx.threadId || ctx.userId)
    return {
      threadOpts: { userId: ctx.userId, threadId: ctx.threadId },
      deleteTmpThread: async () => { }
    }

  const thread = await agent.createThread(ctx);

  const deleteTmpThread = async () => {
    if (!thread) return;
    await agent.deleteThreadAsync(ctx, { threadId: thread?.threadId });
  }

  const threadOpts = { threadId: thread.threadId };

  return { threadOpts, deleteTmpThread }
}

type GenerateTextParameters = Parameters<Agent["generateText"]> & { 0: ToolCtx };
type GenerateObjectParameters = Parameters<Agent["generateObject"]> & { 0: ToolCtx };

export const wrapAgent = (agent: Agent) => {
  return {
    ...agent,
    async generateText(...args: GenerateTextParameters) {
      const { threadOpts, deleteTmpThread } = await getThreadOpts(args[0], agent);
      try {
        return await agent.generateText(args[0], { ...threadOpts, ...args[1] }, args[2], args[3]);
      } finally {
        await deleteTmpThread();
      }
    },
    generateObject: async (...args: GenerateObjectParameters) => {
      const { threadOpts, deleteTmpThread } = await getThreadOpts(args[0], agent);
      try {
        return await agent.generateObject(args[0], { ...threadOpts, ...args[1] }, args[2], args[3]);
      } finally {
        await deleteTmpThread();
      }
    },
  } as Agent;
};
