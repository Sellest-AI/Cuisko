import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

import { REVIEW_ACCOUNT } from "../../../functions/auth/reviewAccount";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/__tests__/getAccount.test.ts.
const modules = import.meta.glob("/convex/**/*.*s");

/** See router/users/__tests__/getMe.test.ts for why the module graph is loaded before the first test. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/auth/getReviewAccount."))
      .map(([, load]) => load()),
  ),
);

type Config = { liveVersion: string; reviewVersion?: string };

const seedConfig = (t: ReturnType<typeof convexTest>, config: Config) =>
  t.run((ctx) => ctx.db.insert("appConfig", { ...config, updatedAt: Date.now() }));

const ask = (t: ReturnType<typeof convexTest>, appVersion: string) =>
  t.query(api.router.auth.getReviewAccount.anon, { appVersion });

describe("router/auth/getReviewAccount", () => {
  test("is reachable with no identity, since it runs before sign-in, and says nothing without a config row", async () => {
    const t = convexTest(schema, modules);

    expect(await ask(t, "0.2.0")).toBeNull();
  });

  test("hands the account to the build in review", async () => {
    const t = convexTest(schema, modules);
    await seedConfig(t, { liveVersion: "0.1.0", reviewVersion: "0.2.0" });

    expect(await ask(t, "0.2.0")).toEqual(REVIEW_ACCOUNT);
  });

  test("hands nothing to the version people have from the store", async () => {
    const t = convexTest(schema, modules);
    await seedConfig(t, { liveVersion: "0.1.0", reviewVersion: "0.2.0" });

    expect(await ask(t, "0.1.0")).toBeNull();
  });

  test("hands nothing once the reviewed version is released", async () => {
    const t = convexTest(schema, modules);
    await seedConfig(t, { liveVersion: "0.2.0", reviewVersion: "0.2.0" });

    expect(await ask(t, "0.2.0")).toBeNull();
  });
});
