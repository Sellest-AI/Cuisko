import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import { ADMIN_MULTIPLIER, RATE_LIMITS } from "../../../lib/rateLimits";
import { registerRateLimiter, warmRateLimiter } from "../../../lib/__tests__/rateLimiterTest";
import schema from "../../../schema";
import { enforceRateLimit } from "../enforceRateLimit";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

beforeAll(warmRateLimiter);

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
  registerRateLimiter(t);
});

const newUser = () => t.run((ctx) => ctx.db.insert("users", { name: "Franck", email: "f@example.com" }));

type Role = "USER" | "ADMIN";
const attempt = (userId: Id<"users">, kind: keyof typeof RATE_LIMITS, role: Role = "USER", count = 1) =>
  // `t.run` serialises its result, and `undefined` comes back as `null`: resolve to nothing instead.
  t.run((ctx) => enforceRateLimit({ ...ctx, userId, user: { role } }, kind, count)).then(() => undefined);

/** Spends `count` tokens and resolves to how many were refused: a refusal is the data, not a failure. */
const refusals = async (userId: Id<"users">, kind: keyof typeof RATE_LIMITS, count: number, role: Role = "USER") => {
  let refused = 0;
  for (let call = 0; call < count; call++) {
    await attempt(userId, kind, role).catch((error) => {
      if (error?.data?.code !== "RATE_LIMITED") throw error;
      refused++;
    });
  }

  return refused;
};

describe("functions/rateLimits/enforceRateLimit", () => {
  test("a cook can burst up to the bucket's capacity, then is refused", async () => {
    const cook = await newUser();

    expect(await refusals(cook, "assistant", RATE_LIMITS.assistant.capacity)).toBe(0);
    await expect(attempt(cook, "assistant")).rejects.toMatchObject({ data: { code: "RATE_LIMITED" } });
  });

  /**
   * The refusal says it was refused and nothing more. Which limit was hit and when it resets are
   * exactly what someone probing the allowance wants to learn, and the cook does not need either.
   */
  test("a refusal carries no kind and no wait", async () => {
    const cook = await newUser();
    await refusals(cook, "assistant", RATE_LIMITS.assistant.capacity);

    const error = await attempt(cook, "assistant").catch((caught) => caught);

    expect(error.data).toEqual({ code: "RATE_LIMITED" });
  });

  test("a fixed window allows its rate, then refuses the next", async () => {
    const cook = await newUser();

    expect(await refusals(cook, "recipeImport", RATE_LIMITS.recipeImport.rate)).toBe(0);
    await expect(attempt(cook, "recipeImport")).rejects.toMatchObject({ data: { code: "RATE_LIMITED" } });
  });

  /** One upload request can stand for many images, and a limit meant for one must not be carried past in a batch. */
  test("a batch takes a token per item", async () => {
    const cook = await newUser();
    const capacity = RATE_LIMITS.imageUpload.capacity;

    await attempt(cook, "imageUpload", "USER", capacity - 1);

    await attempt(cook, "imageUpload");
    await expect(attempt(cook, "imageUpload")).rejects.toMatchObject({ data: { code: "RATE_LIMITED" } });
  });

  test("a batch that does not fit in what is left is refused whole, and takes nothing", async () => {
    const cook = await newUser();
    await attempt(cook, "imageUpload", "USER", RATE_LIMITS.imageUpload.capacity - 2);

    await expect(attempt(cook, "imageUpload", "USER", 3)).rejects.toMatchObject({ data: { code: "RATE_LIMITED" } });
    await expect(attempt(cook, "imageUpload", "USER", 2)).resolves.toBeUndefined();
  });

  test("a batch bigger than the whole capacity is refused", async () => {
    const cook = await newUser();

    await expect(attempt(cook, "imageUpload", "USER", RATE_LIMITS.imageUpload.capacity + 1)).rejects.toMatchObject({
      data: { code: "RATE_LIMITED" },
    });
  });

  test("an empty batch takes nothing and is let through", async () => {
    const cook = await newUser();

    await expect(attempt(cook, "imageUpload", "USER", 0)).resolves.toBeUndefined();
  });

  test("one cook running dry does not touch another", async () => {
    const spammer = await newUser();
    const bystander = await newUser();
    await refusals(spammer, "assistant", RATE_LIMITS.assistant.capacity + 1);

    await expect(attempt(bystander, "assistant")).resolves.toBeUndefined();
  });

  test("the kinds are separate allowances", async () => {
    const cook = await newUser();
    await refusals(cook, "assistant", RATE_LIMITS.assistant.capacity + 1);

    await expect(attempt(cook, "assistantClassify")).resolves.toBeUndefined();
  });

  test("an admin passes where the same count refuses a member, up to the multiplied capacity", async () => {
    const member = await newUser();
    const admin = await newUser();
    const beyondMember = RATE_LIMITS.assistant.capacity + 1;

    expect(await refusals(member, "assistant", beyondMember)).toBe(1);
    expect(await refusals(admin, "assistant", beyondMember, "ADMIN")).toBe(0);

    const adminCapacity = RATE_LIMITS.assistant.capacity * ADMIN_MULTIPLIER;
    expect(await refusals(admin, "assistant", adminCapacity - beyondMember + 1, "ADMIN")).toBe(1);
  });
});
