/**
 * The shared account a store reviewer signs in with.
 *
 * In code, not in env or the database, because `getReviewAccount` hands it to any build the window
 * is open for, so there is no secret to keep from the people it is shown to. What this costs: it is
 * in git, and the password provider accepts it on the production server at any time, window or not.
 * The window controls who is told these credentials, never who can use them. It is an ordinary user
 * with no privileges, and anything it can reach is what any new account can reach.
 *
 * ⚠️ Never edit the password once the account exists on a deployment. The account is created on the
 * first long press with whatever is here (through the signIn-then-signUp fallback in
 * `src/lib/convex/auth.ts`; if that fallback goes, so does this story), and changing this later
 * leaves the stored account on the old password: the sign-in fails and the reviewer sees an error with no reason. To change it, delete
 * the user on that deployment first.
 */
export const REVIEW_ACCOUNT = {
  email: "review@cuisko.app",
  password: "6Vohcz_oTFvOCH6rrpyVtcyr",
} as const;
