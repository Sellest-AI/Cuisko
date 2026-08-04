import { authQuery } from "@convex/procedures";

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
  }),
});
