// The second dot in this file's name is load-bearing, as in `rateLimiter.fixtures.ts`.

/**
 * The backend as lazy loaders, for `convexTest(schema, modules)`. One copy, read by every test file:
 * Vite expands a glob into one entry per file, so 127 files each writing their own had it expanded
 * 127 times over some 580 files, by the one process every worker queues for. Sharing it took a full
 * test run from 75 s to 52 s, which is why C10 refuses a glob in a test file.
 *
 * Root-anchored on purpose. A relative pattern (`../../../**`) makes Vite emit shortest-relative keys
 * — `../getAccount.ts` for a near file but `../../../_generated/api.js` for a far one — and convex-test
 * resolves functions by gluing one prefix onto the function path, so the near files silently go
 * missing. A leading `/` is resolved against the Vite root, giving every key the same `/convex/`
 * prefix. `*.*s` (not `*.ts`) so the generated `.js` modules come along too.
 */
export const modules = import.meta.glob("/convex/**/*.*s");
