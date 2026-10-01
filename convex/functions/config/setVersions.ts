import { ConvexError } from "convex/values";

import { compareVersions } from "../../lib/compareVersions";
import type { MutationCtx } from "../../procedures";

type Args = { liveVersion?: string; reviewVersion?: string | null };

/**
 * Writes the singleton `appConfig` row, creating it on the first call.
 *
 * Refuses a string that is not a version: it would sit there looking set while `reviewWindow`
 * quietly treated it as closed, and the next review would fail with no error anywhere. A field left
 * out is left alone; `reviewVersion: null` clears it.
 */
export const setVersions = async (ctx: MutationCtx, { liveVersion, reviewVersion }: Args) => {
  for (const version of [liveVersion, reviewVersion]) {
    if (typeof version === "string" && compareVersions(version, version) === null)
      throw new ConvexError({ code: "INVALID_VERSION", version });
  }

  const existing = await ctx.db.query("appConfig").withIndex("by_creation_time").first();

  if (!existing) {
    if (!liveVersion) throw new ConvexError({ code: "LIVE_VERSION_REQUIRED" });
    await ctx.db.insert("appConfig", {
      liveVersion,
      ...(typeof reviewVersion === "string" ? { reviewVersion } : {}),
      updatedAt: Date.now(),
    });
    return;
  }

  await ctx.db.patch(existing._id, {
    ...(liveVersion !== undefined ? { liveVersion } : {}),
    // `undefined` is how Convex's patch removes an optional field.
    ...(reviewVersion !== undefined ? { reviewVersion: reviewVersion ?? undefined } : {}),
    updatedAt: Date.now(),
  });
};
