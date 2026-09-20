import { authQuery } from "@convex/procedures";
import { avatarSeed } from "@shared/avatars";

/**
 * The signed-in caller's own identity.
 *
 * Takes no arguments on purpose: the user comes from `ctx`, which `authQuery` resolved before
 * this handler ran. An endpoint that accepted a `userId` would be the shape that produced the
 * predecessor's two IDORs — and would have to be named `admin` and bound to `adminQuery`.
 *
 * Returns a projection rather than the merged `AppUser`, so adding a field to `usersExtended`
 * never silently widens what the client receives.
 */
export const authed = authQuery({
  args: {},
  handler: async (ctx) => ({
    id: ctx.user._id,
    email: ctx.user.email ?? null,
    role: ctx.user.role,
    /**
     * The caller's own avatar, derived here rather than on the client that could derive it just as
     * easily. A recipe's chef seed is built by the server too, and the two have to agree for the
     * same cook to wear one face on both screens — two producers shipping on two release schedules
     * is how they stop agreeing. See `shared/avatars.ts`.
     */
    avatarSeed: avatarSeed(ctx.user._id),
  }),
});
