import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { beforeAll, describe, expect, test } from "vitest";

import { internal } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/__tests__/getAccount.test.ts.
const modules = import.meta.glob("/convex/**/*.*s");

/** See router/users/__tests__/getMe.test.ts for why the module graph is loaded before the first test. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/config/setVersions."))
      .map(([, load]) => load()),
  ),
);

const rows = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("appConfig").collect());
const set = (t: ReturnType<typeof convexTest>, args: FunctionArgs<typeof internal.router.config.setVersions._internal>) =>
  t.mutation(internal.router.config.setVersions._internal, args);

describe("router/config/setVersions._internal", () => {
  test("the first call creates the row and needs the live version", async () => {
    const t = convexTest(schema, modules);

    await expect(set(t, { reviewVersion: "0.2.0" })).rejects.toThrow(/LIVE_VERSION_REQUIRED/);

    await set(t, { liveVersion: "0.1.0" });
    expect(await rows(t)).toMatchObject([{ liveVersion: "0.1.0" }]);
  });

  test("a field left out is left alone, and there is only ever one row", async () => {
    const t = convexTest(schema, modules);
    await set(t, { liveVersion: "0.1.0" });

    await set(t, { reviewVersion: "0.2.0" });
    await set(t, { liveVersion: "0.2.0" });

    expect(await rows(t)).toMatchObject([{ liveVersion: "0.2.0", reviewVersion: "0.2.0" }]);
  });

  test("null clears the review version", async () => {
    const t = convexTest(schema, modules);
    await set(t, { liveVersion: "0.1.0", reviewVersion: "0.2.0" });

    await set(t, { reviewVersion: null });

    const [row] = await rows(t);
    expect(row).toMatchObject({ liveVersion: "0.1.0" });
    expect(row).not.toHaveProperty("reviewVersion");
  });

  test("refuses a string that is not a version, so a typo cannot sit there looking set", async () => {
    const t = convexTest(schema, modules);
    await set(t, { liveVersion: "0.1.0" });

    await expect(set(t, { reviewVersion: "0.2.0-beta" })).rejects.toThrow(/INVALID_VERSION/);
    expect(await rows(t)).toMatchObject([{ liveVersion: "0.1.0" }]);
  });
});
