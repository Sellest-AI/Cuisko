import { setVersions } from "@convex/functions/config/setVersions";
import { internalMutation } from "@convex/procedures";
import { v } from "convex/values";

/**
 * Records which versions exist. Internal, so only a terminal, the dashboard or a deploy key can call
 * it. The prod deploy (`.github/workflows/deploy.yml`) does both steps below on its own; by hand:
 *
 *   npx convex run router/config/setVersions:_internal '{"liveVersion":"0.1.0"}' --prod        # first call
 *   npx convex run router/config/setVersions:_internal '{"reviewVersion":"0.2.0"}' --prod      # submitted
 *   npx convex run router/config/setVersions:_internal '{"liveVersion":"0.2.0"}' --prod        # released
 *
 * A field left out is left alone; `reviewVersion: null` clears it. The first call must carry
 * `liveVersion`, since a row cannot exist without it.
 */
export const _internal = internalMutation({
  args: {
    liveVersion: v.optional(v.string()),
    reviewVersion: v.optional(v.union(v.string(), v.null())),
  },
  handler: (ctx, args) => setVersions(ctx, args),
});
