import { authTables } from "@convex-dev/auth/server";
import { defineSchema } from "convex/server";

import { usersExtended } from "./schema/users";

/**
 * `authTables` (users, authAccounts, authSessions, …) are owned by @convex-dev/auth.
 * They carry no `updatedAt` (S5) because we never write them — the component does.
 * Everything of ours goes in a sibling table instead.
 */
export default defineSchema({
  ...authTables,
  usersExtended,
});
