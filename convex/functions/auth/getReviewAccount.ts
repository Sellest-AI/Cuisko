import type { QueryCtx } from "../../procedures";
import { reviewWindow } from "./reviewWindow";

/** What `router/auth/getReviewAccount` answers: the credentials while the window is open to this build. */
export const getReviewAccount = async (ctx: QueryCtx, appVersion: string) => {
  const config = await ctx.db.query("appConfig").withIndex("by_creation_time").first();
  return reviewWindow(config, appVersion);
};
