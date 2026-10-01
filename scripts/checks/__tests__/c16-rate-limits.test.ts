/**
 * C16's own tests.
 *
 * An `authed` operation that reaches a model without a rate limit is one cook running up
 * the bill (ADR 0018). The first cases are the shapes the check exists for, and if C16 ever stops
 * failing them, those tests go red. The rest pin what it must not flag, so that a check that is too
 * eager does not teach anyone to allowlist it.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, passed, runCheck } from "./_harness";

const SCRIPT = "c16-rate-limits.mjs";

afterEach(cleanupTrees);

const GUARD = {
  "convex/functions/rateLimits/enforceRateLimit.ts": `export const enforceRateLimit = async () => {};`,
};

const MODEL = {
  "convex/agent/tools/sanitizeRecipe.ts": `export const sanitizeRecipe = { run: async () => ({}) };`,
};

describe("an authed operation that reaches a model without a rate limit", () => {
  it("rejects one that imports the agent directly", () => {
    const { code, output } = runCheck(SCRIPT, {
      ...GUARD,
      ...MODEL,
      "convex/router/recipes/createOne.ts": `
        import { sanitizeRecipe } from "../../agent/tools/sanitizeRecipe";
        export const authed = { handler: () => sanitizeRecipe.run() };
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/router/recipes/createOne.ts:3");
    expect(output).toContain("never reaches `enforceRateLimit`");
  });

  /** The usual shape: the router calls a function, and the function calls the model. */
  it("rejects one that reaches the model through a function and the @convex alias", () => {
    const { code } = runCheck(SCRIPT, {
      ...GUARD,
      ...MODEL,
      "convex/functions/recipes/generateRecipe.ts": `
        import { sanitizeRecipe } from "@convex/agent/tools/sanitizeRecipe";
        export const generateRecipe = () => sanitizeRecipe.run();
      `,
      "convex/router/recipes/createOne.ts": `
        import { generateRecipe } from "@convex/functions/recipes/generateRecipe";
        export const authed = { handler: () => generateRecipe() };
      `,
    });

    expect(code).toBe(1);
  });

  /** Storage is a cost a cook can run up as well, and `uploadMany` reaches it by import. */
  it("rejects one that reaches the storage client", () => {
    const { code } = runCheck(SCRIPT, {
      ...GUARD,
      "convex/lib/s3/node.ts": `export const putObject = async () => ({});`,
      "convex/router/media/images/uploadMany.ts": `
        import { putObject } from "../../../lib/s3/node";
        export const authed = { handler: () => putObject() };
      `,
    });

    expect(code).toBe(1);
  });

  it("rejects an admin operation the same way", () => {
    const { code } = runCheck(SCRIPT, {
      ...GUARD,
      "convex/lib/typesafe/ask.ts": `export const ask = async () => ({});`,
      "convex/router/assistant/classify.ts": `
        import { ask } from "../../lib/typesafe/ask";
        export const admin = { handler: () => ask() };
      `,
    });

    expect(code).toBe(1);
  });

  it("rejects an operation that imports the rate limit only as a type", () => {
    const { code } = runCheck(SCRIPT, {
      ...GUARD,
      ...MODEL,
      "convex/router/recipes/createOne.ts": `
        import type { enforceRateLimit } from "../../functions/rateLimits/enforceRateLimit";
        import { sanitizeRecipe } from "../../agent/tools/sanitizeRecipe";
        export const authed = { handler: () => sanitizeRecipe.run() };
      `,
    });

    expect(code).toBe(1);
  });
});

/**
 * An operation hands its paid work to an `internal` action through `internal.<path>.<export>`, which
 * no import shows. The action is marked `@costly`, and the `authed` caller must carry the guard in
 * its own imports.
 */
describe("an authed operation that calls a costly internal action", () => {
  const SCRAPER = {
    "convex/lib/scraping/fetchPage.ts": `export const fetchPage = async () => "";`,
    "convex/router/recipes/importOneNode.ts": `
      import { fetchPage } from "../../lib/scraping/fetchPage";
      import { internalAction } from "../../procedures";
      /** @costly Fetches a page. */
      export const _internal = internalAction({ handler: () => fetchPage() });
    `,
  };

  it("rejects one that calls it through an internal reference and never reaches the guard", () => {
    const { code, output } = runCheck(SCRIPT, {
      ...GUARD,
      ...SCRAPER,
      "convex/router/recipes/importOne.ts": `
        import { internal } from "../../_generated/api";
        export const authed = { handler: (ctx) => ctx.runAction(internal.router.recipes.importOneNode._internal, {}) };
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/router/recipes/importOne.ts");
    expect(output).toContain("marked `@costly`");
  });

  it("rejects one that reaches the call through a helper", () => {
    const { code } = runCheck(SCRIPT, {
      ...GUARD,
      ...SCRAPER,
      "convex/functions/recipes/extract.ts": `
        import { internal } from "../../_generated/api";
        export const extract = (ctx) => ctx.runAction(internal.router.recipes.importOneNode._internal, {});
      `,
      "convex/router/recipes/importOne.ts": `
        import { extract } from "../../functions/recipes/extract";
        export const authed = { handler: (ctx) => extract(ctx) };
      `,
    });

    expect(code).toBe(1);
  });

  it("rejects one that schedules it", () => {
    const { code } = runCheck(SCRIPT, {
      ...GUARD,
      ...SCRAPER,
      "convex/router/recipes/importOne.ts": `
        import { internal } from "../../_generated/api";
        export const authed = { handler: (ctx) => ctx.scheduler.runAfter(0, internal.router.recipes.importOneNode._internal, {}) };
      `,
    });

    expect(code).toBe(1);
  });

  /** The file that holds the action also imports the guard for its own `authed`: that is not the caller's guard. */
  it("rejects one whose only guard is in the module it calls", () => {
    const { code } = runCheck(SCRIPT, {
      ...GUARD,
      "convex/lib/s3/node.ts": `export const putObject = async () => ({});`,
      "convex/router/media/images/uploadMany.ts": `
        import { enforceRateLimit } from "../../../functions/rateLimits/enforceRateLimit";
        import { putObject } from "../../../lib/s3/node";
        import { internalAction } from "../../../procedures";
        export const authed = { handler: (ctx) => enforceRateLimit(ctx, "imageUpload") };
        /** @costly Uploads. */
        export const _internal = internalAction({ handler: () => putObject() });
      `,
      "convex/router/media/images/uploadOne.ts": `
        import { internal } from "../../../_generated/api";
        export const authed = { handler: (ctx) => ctx.runAction(internal.router.media.images.uploadMany._internal, {}) };
      `,
    });

    expect(code).toBe(1);
  });

  it("accepts one that calls it and carries the guard", () => {
    const result = runCheck(SCRIPT, {
      ...GUARD,
      ...SCRAPER,
      "convex/router/recipes/importOne.ts": `
        import { internal } from "../../_generated/api";
        import { enforceRateLimit } from "../../functions/rateLimits/enforceRateLimit";
        export const authed = { handler: async (ctx) => { await enforceRateLimit(ctx, "recipeImport"); return ctx.runAction(internal.router.recipes.importOneNode._internal, {}); } };
      `,
    });

    expect(passed(result)).toBe(true);
  });

  it("accepts one that calls an internal function nobody marked costly", () => {
    const result = runCheck(SCRIPT, {
      ...GUARD,
      "convex/router/recipes/createOne.ts": `
        import { internalMutation } from "../../procedures";
        export const _internal_persist = internalMutation({ handler: () => null });
      `,
      "convex/router/recipes/updateOne.ts": `
        import { internal } from "../../_generated/api";
        export const authed = { handler: (ctx) => ctx.runMutation(internal.router.recipes.createOne._internal_persist, {}) };
      `,
    });

    expect(passed(result)).toBe(true);
  });
});

/** The marker is only as good as its coverage, so a paid action that is not marked is itself a finding. */
describe("an internal action that reaches a paid service", () => {
  const PAID = { "convex/lib/typesafe/ask.ts": `export const ask = async () => ({});` };

  it("rejects one that is not marked costly", () => {
    const { code, output } = runCheck(SCRIPT, {
      ...GUARD,
      ...PAID,
      "convex/router/assistant/classifyNode.ts": `
        import { ask } from "../../lib/typesafe/ask";
        import { internalAction } from "../../procedures";
        export const _internal = internalAction({ handler: () => ask() });
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/router/assistant/classifyNode.ts");
    expect(output).toContain("not marked `@costly`");
  });

  /** A type argument is part of the call, not a different builder. */
  it("rejects one built with a type argument", () => {
    const { code } = runCheck(SCRIPT, {
      ...GUARD,
      ...PAID,
      "convex/router/assistant/classifyNode.ts": `
        import { ask } from "../../lib/typesafe/ask";
        import { internalAction } from "../../procedures";
        export const _internal = internalAction<Args>({ handler: () => ask() });
      `,
    });

    expect(code).toBe(1);
  });

  it("accepts one that is marked", () => {
    const result = runCheck(SCRIPT, {
      ...GUARD,
      ...PAID,
      "convex/router/assistant/classifyNode.ts": `
        import { ask } from "../../lib/typesafe/ask";
        import { internalAction } from "../../procedures";
        /** @costly Calls the model. */
        export const _internal = internalAction({ handler: () => ask() });
      `,
    });

    expect(passed(result)).toBe(true);
  });

  /** Only an action can call out, so only an action needs the tag. */
  it("accepts a mutation in the same file", () => {
    const result = runCheck(SCRIPT, {
      ...GUARD,
      ...PAID,
      "convex/router/assistant/classifyNode.ts": `
        import { ask } from "../../lib/typesafe/ask";
        import { internalMutation } from "../../procedures";
        export const _internal_persist = internalMutation({ handler: () => ask });
      `,
    });

    expect(passed(result)).toBe(true);
  });

  it("accepts an action that reaches no paid service", () => {
    const result = runCheck(SCRIPT, {
      ...GUARD,
      "convex/router/recipes/restoreOne.ts": `
        import { internalAction } from "../../procedures";
        export const _internal = internalAction({ handler: () => null });
      `,
    });

    expect(passed(result)).toBe(true);
  });
});

describe("a limit nothing applies", () => {
  const LIMITS = `
    export const RATE_LIMITS = {
      assistant: { kind: "token bucket", rate: 50, period: 1, capacity: 20 },
      recipeImport: { kind: "fixed window", rate: 10, period: 1 },
    } as const;
  `;

  it("rejects an RATE_LIMITS entry no operation applies", () => {
    const { code, output } = runCheck(SCRIPT, {
      ...GUARD,
      "convex/lib/rateLimits.ts": LIMITS,
      "convex/router/assistant/sendMessage.ts": `
        import { enforceRateLimit } from "../../functions/rateLimits/enforceRateLimit";
        export const authed = { handler: (ctx) => enforceRateLimit(ctx, "assistant") };
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("`recipeImport` is in RATE_LIMITS and no operation applies it");
  });
});

describe("what it lets through", () => {
  it("accepts an operation that rate limits directly", () => {
    const result = runCheck(SCRIPT, {
      ...GUARD,
      ...MODEL,
      "convex/router/recipes/createOne.ts": `
        import { enforceRateLimit } from "../../functions/rateLimits/enforceRateLimit";
        import { sanitizeRecipe } from "../../agent/tools/sanitizeRecipe";
        export const authed = { handler: async (ctx) => { await enforceRateLimit(ctx, "recipeWrite"); return sanitizeRecipe.run(); } };
      `,
    });

    expect(passed(result)).toBe(true);
  });

  /** `updateOne` rate limits inside `regenerateRecipe`, where the model decision is made. */
  it("accepts a rate limit applied deeper than the router", () => {
    const result = runCheck(SCRIPT, {
      ...GUARD,
      ...MODEL,
      "convex/functions/recipes/regenerateRecipe.ts": `
        import { enforceRateLimit } from "../rateLimits/enforceRateLimit";
        import { sanitizeRecipe } from "../../agent/tools/sanitizeRecipe";
        export const regenerateRecipe = async (ctx) => { await enforceRateLimit(ctx, "recipeWrite"); return sanitizeRecipe.run(); };
      `,
      "convex/router/recipes/updateOne.ts": `
        import { regenerateRecipe } from "../../functions/recipes/regenerateRecipe";
        export const authed = { handler: (ctx) => regenerateRecipe(ctx) };
      `,
    });

    expect(passed(result)).toBe(true);
  });

  it("accepts an authed operation that reaches no model", () => {
    const result = runCheck(SCRIPT, {
      ...GUARD,
      "convex/router/recipes/getOne.ts": `export const authed = { handler: () => null };`,
    });

    expect(passed(result)).toBe(true);
  });

  /** An internal export carries no identity: the `authed` entry that scheduled it already rate limited. */
  it("accepts an internal operation that reaches the model", () => {
    const result = runCheck(SCRIPT, {
      ...GUARD,
      ...MODEL,
      "convex/router/recipes/translateOne.ts": `
        import { sanitizeRecipe } from "../../agent/tools/sanitizeRecipe";
        export const _internal = { handler: () => sanitizeRecipe.run() };
      `,
    });

    expect(passed(result)).toBe(true);
  });

  it("accepts a type-only import of the model, which is erased", () => {
    const result = runCheck(SCRIPT, {
      ...GUARD,
      ...MODEL,
      "convex/router/recipes/getOne.ts": `
        import type { sanitizeRecipe } from "../../agent/tools/sanitizeRecipe";
        export const authed = { handler: () => null };
      `,
    });

    expect(passed(result)).toBe(true);
  });

  it("accepts the allowlisted transcript reader that imports the agent", () => {
    const result = runCheck(SCRIPT, {
      ...GUARD,
      "convex/agent/agents.ts": `export const assistantAgent = {};`,
      "convex/router/assistant/listMessages.ts": `
        import { assistantAgent } from "../../agent/agents";
        export const authed = { handler: () => assistantAgent };
      `,
    });

    expect(passed(result)).toBe(true);
  });

  it("accepts a limit that an operation applies through `withRateLimit`", () => {
    const result = runCheck(SCRIPT, {
      ...GUARD,
      "convex/lib/rateLimits.ts": `
        export const RATE_LIMITS = {
          recipeImport: { kind: "fixed window", rate: 10, period: 1 },
        } as const;
      `,
      "convex/router/recipes/importOne.ts": `
        import { withRateLimit } from "../../functions/rateLimits/enforceRateLimit";
        export const authed = { handler: (ctx) => withRateLimit(ctx, "recipeImport", () => null) };
      `,
    });

    expect(passed(result)).toBe(true);
  });

  it("passes on this repo", () => {
    expect(passed(runCheck(SCRIPT, {}, process.cwd()))).toBe(true);
  });
});
