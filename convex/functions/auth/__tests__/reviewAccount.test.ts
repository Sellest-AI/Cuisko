import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { REVIEW_ACCOUNT, reviewWindow } from "../reviewAccount";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Warms `auth.ts` before anything is timed: the sign-in tests go through its `store` (C10). */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/auth."))
      .map(([, load]) => load()),
  ),
);

const newDeployment = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof newDeployment>;

const seed = (t: TestConvex, email: string, versions: { liveVersion: string; reviewVersion?: string } | null) =>
  t.run(async (ctx) => {
    if (versions) await ctx.db.insert("appConfig", { ...versions, updatedAt: Date.now() });
    const userId = await ctx.db.insert("users", { name: "Review", email });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    return userId;
  });

/** A sign-in once the provider has vouched for the person: see clearDeletion.test.ts. */
const signIn = (t: TestConvex, userId: Id<"users">) =>
  t.mutation(internal.auth.store, { args: { type: "signIn", userId, generateTokens: false } });

describe("functions/auth/reviewAccount › reviewWindow", () => {
  test("live 0.1.0, no review version: closed to every build", () => {
    expect(reviewWindow({ liveVersion: "0.1.0" }, "0.1.0")).toBeNull();
    expect(reviewWindow({ liveVersion: "0.1.0" }, "0.2.0")).toBeNull();
  });

  test("live 0.1.0, review 0.2.0: the build in review gets the credentials", () => {
    expect(reviewWindow({ liveVersion: "0.1.0", reviewVersion: "0.2.0" }, "0.2.0")).toEqual(REVIEW_ACCOUNT);
  });

  test("live 0.1.0, review 0.2.0: a person on the store version gets nothing", () => {
    expect(reviewWindow({ liveVersion: "0.1.0", reviewVersion: "0.2.0" }, "0.1.0")).toBeNull();
  });

  test("a build newer than the one in review is still inside the window", () => {
    expect(reviewWindow({ liveVersion: "0.1.0", reviewVersion: "0.2.0" }, "0.2.1")).toEqual(REVIEW_ACCOUNT);
  });

  test("releasing shuts the window: live reaches the review version, nobody clears a field", () => {
    expect(reviewWindow({ liveVersion: "0.2.0", reviewVersion: "0.2.0" }, "0.2.0")).toBeNull();
  });

  test("a review version behind the live one is closed", () => {
    expect(reviewWindow({ liveVersion: "0.3.0", reviewVersion: "0.2.0" }, "0.3.0")).toBeNull();
  });

  test("0.10.0 is ahead of 0.9.0: the comparison is numeric", () => {
    expect(reviewWindow({ liveVersion: "0.9.0", reviewVersion: "0.10.0" }, "0.10.0")).toEqual(REVIEW_ACCOUNT);
  });

  test("no config row yet: closed", () => {
    expect(reviewWindow(null, "0.2.0")).toBeNull();
  });

  test("a version that does not parse closes the window, whichever side it is on", () => {
    const open = { liveVersion: "0.1.0", reviewVersion: "0.2.0" };
    expect(reviewWindow(open, "")).toBeNull();
    expect(reviewWindow(open, "latest")).toBeNull();
    expect(reviewWindow({ liveVersion: "0.1.0", reviewVersion: "soon" }, "9.9.9")).toBeNull();
    expect(reviewWindow({ liveVersion: "oops", reviewVersion: "0.2.0" }, "0.2.0")).toBeNull();
  });

  test("the account is long enough for the password provider, which refuses under 8", () => {
    expect(REVIEW_ACCOUNT.password.length).toBeGreaterThanOrEqual(8);
    expect(REVIEW_ACCOUNT.email).toContain("@");
  });

  test("a caller cannot change the account by mutating what it was handed", () => {
    const handed = reviewWindow({ liveVersion: "0.1.0", reviewVersion: "0.2.0" }, "0.2.0")!;
    handed.password = "tampered";

    expect(reviewWindow({ liveVersion: "0.1.0", reviewVersion: "0.2.0" }, "0.2.0")).toEqual(REVIEW_ACCOUNT);
  });
});

describe("functions/auth/reviewAccount › sign-in", () => {
  test("live 0.4.0, review 0.4.0: the review account cannot sign in", async () => {
    const t = newDeployment();
    const userId = await seed(t, REVIEW_ACCOUNT.email, { liveVersion: "0.4.0", reviewVersion: "0.4.0" });

    await expect(signIn(t, userId)).rejects.toThrow("REVIEW_WINDOW_CLOSED");
  });

  test("no config row: the review account cannot sign in", async () => {
    const t = newDeployment();
    const userId = await seed(t, REVIEW_ACCOUNT.email, null);

    await expect(signIn(t, userId)).rejects.toThrow("REVIEW_WINDOW_CLOSED");
  });

  test("live 0.3.4, review 0.4.0: the review account signs in", async () => {
    const t = newDeployment();
    const userId = await seed(t, REVIEW_ACCOUNT.email, { liveVersion: "0.3.4", reviewVersion: "0.4.0" });

    await expect(signIn(t, userId)).resolves.not.toThrow();
  });

  test("a closed window leaves every other account alone", async () => {
    const t = newDeployment();
    const userId = await seed(t, "cook@example.com", { liveVersion: "0.4.0", reviewVersion: "0.4.0" });

    await expect(signIn(t, userId)).resolves.not.toThrow();
  });
});
