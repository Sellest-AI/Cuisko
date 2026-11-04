import mcpTest from "@convex-dev/mcp/test";
import type { convexTest } from "convex-test";

// The second dot in this file's name is load-bearing, as in `rateLimiter.fixtures.ts`: the Convex CLI
// pushes every `convex/` file whose name has a single dot, and `/test` uses `import.meta`.

type ConvexTest = ReturnType<typeof convexTest>;

/** What every test that reaches the MCP component needs: convex-test only knows what it is told. */
export const registerMcp = (t: ConvexTest) => mcpTest.register(t);

/**
 * The component's own functions, imported before anything is timed — C10 rule 4, for the reason
 * `warmRateLimiter` gives. `convex.config.ts` is left out: it only runs in the Convex runtime.
 */
export const warmMcp = () =>
  Promise.all(
    Object.entries(mcpTest.modules)
      .filter(([path]) => !path.includes("convex.config"))
      .map(([, load]) => load()),
  );
