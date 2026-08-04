import { httpRouter } from "convex/server";

import { auth } from "./auth";

/**
 * The HTTP route table.
 *
 * @convex-dev/auth mounts its own sign-in / token-refresh routes here. Our own webhooks go in
 * `convex/http/` and are defined with `verifiedWebhook` — never bare `httpAction` (ADR 0004).
 */
const http = httpRouter();

auth.addHttpRoutes(http);

export default http;
