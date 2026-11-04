import { httpRouter } from "convex/server";

import { auth } from "./auth";
import { mcp } from "./mcp";

/**
 * The HTTP route table.
 *
 * @convex-dev/auth mounts its own sign-in / token-refresh routes here, and @convex-dev/mcp its OAuth
 * server and `/mcp`. Our own webhooks go in `convex/http/` and are defined with `verifiedWebhook` —
 * never bare `httpAction` (ADR 0004).
 */
const http = httpRouter();

auth.addHttpRoutes(http);
mcp.registerRoutes(http);

export default http;
