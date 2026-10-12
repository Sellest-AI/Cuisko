/**
 * C17's own tests.
 *
 * A paid call with no trace is a cost recorded nowhere, and at run time only a log line says so
 * (ADR 0019). The first cases are the shapes the check exists for; the
 * rest pin what it must leave alone, so an eager check does not teach anyone to fill PENDING.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, passed, runCheck } from "./_harness";

const SCRIPT = "c17-traces.mjs";

afterEach(cleanupTrees);

const MODEL = {
  "convex/agent/tools/sanitizeIngredient.ts": `export const sanitizeIngredient = { run: async () => ({}) };`,
};

/** A paid internal action, marked as C16 requires, and the route that hands work to it. */
const COSTLY = {
  "convex/router/ingredients/generateImageNode.ts": `
    import { sanitizeIngredient } from "../../agent/tools/sanitizeIngredient";
    /** @costly */
    export const _internal = internalAction({ args: {}, handler: () => sanitizeIngredient.run() });
  `,
};

describe("a route that reaches a paid call", () => {
  it("rejects one that starts no trace", () => {
    const { code, output } = runCheck(SCRIPT, {
      ...MODEL,
      "convex/router/ingredients/resolve.ts": `
        import { sanitizeIngredient } from "@convex/agent/tools/sanitizeIngredient";
        export const authed = authActionI18n({ args: {}, handler: () => sanitizeIngredient.run() });
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/router/ingredients/resolve.ts:3");
    expect(output).toContain("starts no trace");
  });

  it("accepts one whose builder is given `trace`", () => {
    const result = runCheck(SCRIPT, {
      ...MODEL,
      "convex/router/ingredients/resolve.ts": `
        import { sanitizeIngredient } from "@convex/agent/tools/sanitizeIngredient";
        export const authed = authActionI18n({
          trace: "ingredients/resolve",
          args: {},
          handler: () => sanitizeIngredient.run(),
        });
      `,
    });

    expect(passed(result)).toBe(true);
  });

  /** The `sendMessage` shape (renamed: the real file is in PENDING): a reference, no import of the model. */
  it("rejects a mutation that schedules a @costly action and starts no trace", () => {
    const { code, output } = runCheck(SCRIPT, {
      ...MODEL,
      ...COSTLY,
      "convex/router/assistant/askChef.ts": `
        export const authed = authMutation({
          args: {},
          handler: (ctx) => ctx.scheduleTracedAfter(0, internal.router.ingredients.generateImageNode._internal, {}),
        });
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("marked `@costly`, and starts no trace");
  });

  it("leaves a query alone: it never spends, and no query builder takes the option", () => {
    const result = runCheck(SCRIPT, {
      ...MODEL,
      "convex/router/assistant/listMessages.ts": `
        import { sanitizeIngredient } from "@convex/agent/tools/sanitizeIngredient";
        export const authed = authQuery({ args: {}, handler: () => sanitizeIngredient });
      `,
    });

    expect(passed(result)).toBe(true);
  });

  it("leaves a route alone that reaches nothing paid", () => {
    const result = runCheck(SCRIPT, {
      "convex/router/cellars/addToCellar.ts": `export const authed = householdMutation({ args: {}, handler: () => null });`,
    });

    expect(passed(result)).toBe(true);
  });
});

describe("a hop to a @costly action", () => {
  it.each([
    ["runAction", "ctx.runAction(internal.router.ingredients.generateImageNode._internal, {})", "runTracedAction"],
    ["runAfter", "ctx.scheduler.runAfter(0, internal.router.ingredients.generateImageNode._internal, {})", "scheduleTracedAfter"],
    ["runAt", "ctx.scheduler.runAt(0, internal.router.ingredients.generateImageNode._internal, {})", "scheduleTracedAfter"],
  ])("rejects plain %s, in any file under convex/", (_, call, fix) => {
    const { code, output } = runCheck(SCRIPT, {
      ...MODEL,
      ...COSTLY,
      "convex/functions/ingredients/resolveIngredient.ts": `export const resolveWithAgent = (ctx) => ${call};`,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/functions/ingredients/resolveIngredient.ts:1");
    expect(output).toContain(fix);
  });

  it("accepts the traced runners", () => {
    const result = runCheck(SCRIPT, {
      ...MODEL,
      ...COSTLY,
      "convex/functions/ingredients/resolveIngredient.ts": `
        export const resolveWithAgent = async (ctx) => {
          await ctx.runTracedAction(internal.router.ingredients.generateImageNode._internal, {});
          await ctx.scheduleTracedAfter(0, internal.router.ingredients.generateImageNode._internal, {});
        };
      `,
    });

    expect(passed(result)).toBe(true);
  });

  /** Deleting an image's files is not a cost: only `@costly` marks one. */
  it("leaves a plain hop to an action that is not @costly alone", () => {
    const result = runCheck(SCRIPT, {
      "convex/router/media/images/deleteOneNode.ts": `export const _internal = internalAction({ args: {}, handler: () => null });`,
      "convex/functions/media/deleteImage.ts": `
        export const deleteImage = (ctx) => ctx.scheduler.runAfter(0, internal.router.media.images.deleteOneNode._internal, {});
      `,
    });

    expect(passed(result)).toBe(true);
  });
});
