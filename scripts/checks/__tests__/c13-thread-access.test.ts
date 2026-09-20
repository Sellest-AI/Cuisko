/**
 * C13's own tests.
 *
 * The check guards a hand-written ownership comparison that nothing else can see: threads live in
 * the agent component, so `ownedQuery('threads')` cannot exist and `ownedThread` is the one place
 * the check is made. C13 asserts that nothing reaches a thread except through the files that call
 * it. The first case is the bypass it exists for — an `Agent` reader called from a router file with
 * a client-supplied `threadId` — and if C13 ever stops failing it, that test goes red.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

const SCRIPT = "c13-thread-access.mjs";

/** What `convex/agent/agents.ts` looks like: constructs agents, reads nothing. */
const AGENTS_TS = `
import { Agent } from "@convex-dev/agent";
import { components } from "@convex/_generated/api";

export const assistantAgent = new Agent(components.agent, {
  name: "Cuisko Assistant",
  contextOptions: { recentMessages: 20, searchOptions: { limit: 0 } },
  maxSteps: 5,
});
`;

afterEach(cleanupTrees);

describe("a thread reached outside the chokepoint", () => {
  it("rejects an Agent reader called from a router with a caller-supplied threadId", () => {
    const { code, output } = runCheck(SCRIPT, {
      "convex/router/assistant/peek.ts": `
        export const authed = authQuery({
          args: { threadId: v.string() },
          handler: (ctx, { threadId }) =>
            assistantAgent.listMessages(ctx, { threadId, paginationOpts: { numItems: 10, cursor: null } }),
        });
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/router/assistant/peek.ts:5");
    expect(output).toContain("another cook's conversation");
  });

  it("rejects the component's thread table read directly", () => {
    const { code, output } = runCheck(SCRIPT, {
      "convex/functions/assistant/lastThread.ts": `
        export const lastThread = (ctx, threadId) =>
          ctx.runQuery(components.agent.threads.getThread, { threadId });
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("`components.agent.threads.getThread`");
    expect(output).toContain("convex/functions/assistant/lastThread.ts:3");
  });

  it("rejects the component reached through destructuring, which never spells `.threads`", () => {
    const { code, output } = runCheck(SCRIPT, {
      "convex/router/assistant/peek.ts": `
        const { threads } = components.agent;
        export const authed = authQuery({ handler: (ctx, { threadId }) => ctx.runQuery(threads.getThread, { threadId }) });
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("`components.agent` reaches the agent component");
    expect(output).toContain("convex/router/assistant/peek.ts:2");
  });

  it("rejects the component reached through an alias", () => {
    const { code, output } = runCheck(SCRIPT, {
      "convex/functions/assistant/alias.ts": `
        const tables = components.agent;
        export const alias = (ctx, threadId) => ctx.runQuery(tables.threads.getThread, { threadId });
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/functions/assistant/alias.ts:2");
  });

  it("rejects each reader method, not only listMessages", () => {
    for (const method of ["syncStreams", "getThreadMetadata"]) {
      const { code, output } = runCheck(SCRIPT, {
        "convex/functions/assistant/other.ts": `
          export const other = (ctx, threadId) => assistantAgent.${method}(ctx, { threadId });
        `,
      });

      expect(code).toBe(1);
      expect(output).toContain(`\`assistantAgent.${method}\``);
    }
  });

  it("reports one finding per line, not one per link in the chain", () => {
    const { output } = runCheck(SCRIPT, {
      "convex/functions/assistant/lastThread.ts":
        "const t = ctx.runQuery(components.agent.threads.getThread, { threadId });",
    });

    expect(output).toContain("1 violation(s)");
  });
});

describe("what C13 must leave alone", () => {
  it("accepts the allowlisted chokepoint and its two callers", () => {
    const { code } = runCheck(SCRIPT, {
      "convex/functions/assistant/ownedThread.ts":
        "const t = await ctx.runQuery(components.agent.threads.getThread, { threadId });",
      "convex/functions/assistant/threadMessages.ts":
        "await assistantAgent.listMessages(ctx, { threadId, paginationOpts });",
      "convex/functions/assistant/openThread.ts":
        "await assistantAgent.listMessages(ctx, { threadId: thread._id, paginationOpts });",
    });

    expect(code).toBe(0);
  });

  it("accepts an agents.ts that constructs Agents but reads no thread", () => {
    const { code } = runCheck(SCRIPT, { "convex/agent/agents.ts": AGENTS_TS });

    expect(code).toBe(0);
  });

  it("ignores test files, which read threads to assert on them", () => {
    const { code } = runCheck(SCRIPT, {
      "convex/router/assistant/__tests__/sendMessage.test.ts":
        "const { page } = await assistantAgent.listMessages(ctx, { threadId, paginationOpts });",
    });

    expect(code).toBe(0);
  });

  it("passes a clean tree", () => {
    const { code, output } = runCheck(SCRIPT, {
      "convex/router/recipes/getOne.ts": "export const authed = ownedQuery('recipes')({});",
    });

    expect(code).toBe(0);
    expect(output).toContain("✅");
  });
});
