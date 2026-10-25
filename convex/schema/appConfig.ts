import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Which app versions exist, as the deployment knows them. A singleton: one row, read with
 * `.first()` on the built-in creation-time index.
 *
 * `liveVersion` is what the stores serve. `reviewVersion` is the build submitted to a store and not
 * yet released. Releasing is setting `liveVersion` to it, so the pair never has to be cleaned up.
 * No row means nothing is known, and everything that reads this treats that as closed.
 *
 * Set by `router/config/setVersions`, which the prod deploy (`.github/workflows/deploy.yml`) calls on
 * every update and store build, or from a terminal. No screen writes it.
 *
 * @singleton one row for the whole deployment, so there is nothing to look it up by; it is read with
 * `.first()` on the built-in `by_creation_time`.
 */
export const appConfig = defineTable({
  liveVersion: v.string(),
  reviewVersion: v.optional(v.string()),
  updatedAt: v.number(), // S5
});
