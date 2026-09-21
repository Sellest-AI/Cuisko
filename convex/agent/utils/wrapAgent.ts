import { Agent, ToolCtx } from "@convex-dev/agent";

/**
 * The caller the agent component is told about when nothing else identifies one.
 *
 * Deliberately a bare string and not an `Id<"users">`: the component's `userId` is an opaque key
 * it never dereferences — no row is read, and none has to exist. A real user row created to
 * satisfy this would be a row nothing owns and nothing cleans up.
 */
const _AGENT_USER = "cuisko";

/**
 * Who the generation is attributed to, and which thread — if any — it belongs to.
 *
 * `@convex-dev/agent` asserts `userId || threadId` before it reads anything else (`assert` in its
 * `fetchRecentAndSearchMessages`), and that assert is the only thing on these paths that needs
 * either field: every tool agent runs `recentMessages: 0` with search off, so no context is
 * fetched, and with no `threadId` nothing is saved. So the fallback is a constant rather than a
 * throwaway thread — creating and deleting one per call cost two mutations and a row to answer a
 * check that never looks at them.
 */
const _threadOpts = (ctx: ToolCtx) => ({
  userId: ctx.userId ?? _AGENT_USER,
  threadId: ctx.threadId,
});

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
      return await agent.generateText(args[0], { ..._threadOpts(args[0]), ...args[1] }, args[2], args[3]);
    },
    generateObject: async (...args: GenerateObjectParameters) => {
      return await agent.generateObject(args[0], { ..._threadOpts(args[0]), ...args[1] }, args[2], args[3]);
    },
  };
};
