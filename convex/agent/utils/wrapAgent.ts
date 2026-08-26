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

/**
 * The two generation calls, each on a thread the caller does not have to own.
 *
 * Deliberately NOT typed as an `Agent`, and it does not spread one: spreading a class instance
 * copies own properties only, so every prototype method would be missing from an object that
 * claimed to have them — `wrapAgent(a).streamText(...)` would compile and then fail at run time
 * with "not a function". Returning only what is actually wrapped turns that into a compile error
 * at the call site. Anything else this needs later gets wrapped here, deliberately.
 */
export const wrapAgent = (agent: Agent) => {
  return {
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
  };
};
