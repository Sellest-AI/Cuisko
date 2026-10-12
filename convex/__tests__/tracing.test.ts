import { convexTest } from "convex-test";
import { type FunctionReference, makeFunctionReference } from "convex/server";
import { beforeAll, describe, expect, test } from "vitest";

import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";

import {
  adminAction,
  adminActionI18n,
  adminMutation,
  adminMutationI18n,
  adminQuery,
  adminQueryI18n,
  authAction,
  authActionI18n,
  authMutation,
  authMutationI18n,
  authQuery,
  authQueryI18n,
  householdMutation,
  householdMutationI18n,
  householdQuery,
  internalAction,
  internalMutation,
  ownedMutation,
  ownedMutationI18n,
  ownedQuery,
  publicAction,
  publicActionI18n,
  publicMutation,
  publicMutationI18n,
  serverAction,
  serverMutation,
  serverQuery,
} from "../procedures";
import schema from "../schema";
import type { TraceContext } from "../schema/tracing";
import { calleeRef, type Seen } from "./tracing.fixtures";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Imports the module under test before any test is timed — see router/preferences/__tests__/getPlanningSeed.test.ts. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/__tests__/tracing.fixtures.") || path.startsWith("/convex/procedures."))
      .map(([, load]) => load()),
  ),
);

const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

type Started = { own: Seen; traced: Seen; plain: Seen; scheduledId: Id<"_scheduled_functions"> };
const startRef = makeFunctionReference<"action", { label: string; locale: "fr" | "en" }, Started>(
  "__tests__/tracing.fixtures:authed",
);
const startFromMutationRef = makeFunctionReference<
  "mutation",
  { label: string },
  { own: Seen; scheduledId: Id<"_scheduled_functions"> }
>("__tests__/tracing.fixtures:authedMutation");

const setup = async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });
    await ctx.db.insert("usersExtended", { userId: id, role: "USER", updatedAt: Date.now() });

    return id;
  });

  return { t, userId, cook: t.withIdentity(asUser(userId)) };
};

describe("procedures tracing", () => {
  // Also pins the wrapper order: `withI18n(withTrace(…))` drops the `trace` option, and this goes red.
  test("a builder given `trace` starts a trace for that operation, for the caller", async () => {
    const { cook, userId } = await setup();

    const { own } = await cook.action(startRef, { label: "x", locale: "fr" });

    expect(own.trace).toEqual({ traceId: expect.any(String), operation: "ingredients/resolve", distinctId: userId });
  });

  test("two calls start two traces", async () => {
    const { cook } = await setup();

    const first = await cook.action(startRef, { label: "x", locale: "fr" });
    const second = await cook.action(startRef, { label: "x", locale: "fr" });

    expect(first.own.trace?.traceId).not.toBe(second.own.trace?.traceId);
  });

  // A client choosing its own trace could file what it spends on another cook's profile, or under
  // another route's average. Only an internal function, which only our code can call, joins one.
  test("a client cannot hand a route its own trace", async () => {
    const { cook, userId } = await setup();
    const forged = { traceId: "forged", operation: "recipes/verifyOne", distinctId: "another-cook" };

    await expect(
      cook.action(startRef, { label: "x", locale: "fr", __trace: forged } as never),
    ).rejects.toThrow(/__trace/);

    const { own } = await cook.action(startRef, { label: "x", locale: "fr" });
    expect(own.trace).toMatchObject({ operation: "ingredients/resolve", distinctId: userId });
  });

  test("a function called with `__trace` joins that trace instead of starting one", async () => {
    const { t } = await setup();
    const trace: TraceContext = { traceId: "trace-from-caller", operation: "recipes/importOne", distinctId: null };

    const seen = await t.action(calleeRef, { label: "x", __trace: trace });

    expect(seen.trace).toEqual(trace);
  });

  test("a builder without `trace`, called plainly, has no trace", async () => {
    const { t } = await setup();

    const seen = await t.action(calleeRef, { label: "x" });

    expect(seen.trace).toBeNull();
  });

  test("`__trace` and `locale` never reach the handler's args", async () => {
    const { cook } = await setup();

    const { own, traced } = await cook.action(startRef, { label: "x", locale: "fr" });

    expect(own.argKeys).toEqual(["label"]);
    expect(traced.argKeys).toEqual(["label"]);
  });

  test("runTracedAction hands the callee the caller's trace; plain runAction does not", async () => {
    const { cook } = await setup();

    const { own, traced, plain } = await cook.action(startRef, { label: "x", locale: "fr" });

    expect(traced.trace).toEqual(own.trace);
    expect(plain.trace).toBeNull();
  });

  test("scheduleTracedAfter puts the caller's trace in the scheduled args", async () => {
    const { t, cook } = await setup();

    const { own, scheduledId } = await cook.action(startRef, { label: "x", locale: "fr" });

    const scheduled = await t.run((ctx) => ctx.db.system.get(scheduledId));
    expect(scheduled?.args[0].__trace).toEqual(own.trace);
  });

  test("a mutation given `trace` starts one and hands it to what it schedules", async () => {
    const { t, cook, userId } = await setup();

    const { own, scheduledId } = await cook.mutation(startFromMutationRef, { label: "x" });

    expect(own.trace).toEqual({ traceId: expect.any(String), operation: "assistant/sendMessage", distinctId: userId });
    expect(own.argKeys).toEqual(["label"]);
    const scheduled = await t.run((ctx) => ctx.db.system.get(scheduledId));
    expect(scheduled?.args[0].__trace).toEqual(own.trace);
  });

  test("only the internal builders declare `__trace`: a trace is joined only from our own code", () => {
    // `exportArgs` is how Convex reads a function's validator at push time. It is on every
    // registered function at runtime but left out of the public types.
    const validatorOf = (fn: unknown) => (fn as { exportArgs: () => string }).exportArgs();
    const definition = { args: { householdId: v.id("households"), id: v.id("recipes") }, handler: async () => null };

    const traced = { internalMutation, internalAction };
    const untraced = {
      // Reached from outside: they start a trace, and never take one.
      publicMutation, publicAction, publicMutationI18n, publicActionI18n,
      authMutation, authAction, authMutationI18n, authActionI18n,
      adminMutation, adminAction, adminMutationI18n, adminActionI18n,
      serverMutation, serverAction,
      ownedMutation: ownedMutation("recipes"), ownedMutationI18n: ownedMutationI18n("recipes"),
      householdMutation, householdMutationI18n,
      // Never traced at all.
      authQuery, authQueryI18n, adminQuery, adminQueryI18n, serverQuery,
      ownedQuery: ownedQuery("recipes"), householdQuery,
    };

    for (const [name, builder] of Object.entries(traced)) {
      expect(validatorOf((builder as typeof internalMutation)(definition)), name).toContain('"__trace"');
    }
    for (const [name, builder] of Object.entries(untraced)) {
      expect(validatorOf((builder as typeof authQuery)(definition)), name).not.toContain('"__trace"');
    }
  });

  test("the traced runners refuse, at compile time, a reference whose args cannot take a trace", () => {
    // A component's function looks like this one: its validator would reject the injected arg.
    const untracedRef = makeFunctionReference("router/anything:_internal") as unknown as FunctionReference<
      "action",
      "internal",
      { label: string },
      null
    >;

    authActionI18n({
      args: {},
      handler: async (ctx) => {
        // @ts-expect-error — `{ label }` declares no `__trace`, so the runner must not accept it.
        await ctx.runTracedAction(untracedRef, { label: "x" });
        return null;
      },
    });
  });
});
