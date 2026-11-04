---
id: 0020
applies_to: ["convex/mcp.ts", "convex/functions/mcp/**/*.ts", "convex/router/users/getMcpUser.ts", "convex/functions/users/purgeUser.ts"]
status: accepted
supersedes: []
---

# An outside agent acts as a verified cook, and never says who that is

MUST: take the cook from the verified token (`user.userId`) in every tool of
      [convex/mcp.ts](../../convex/mcp.ts), and resolve their household on each call through
      `loadCook`, so a cook who leaves a household or whose account is purged stops acting at once.
MUST: run every tool handler through `runTool`, which resolves the cook, spends `mcpCall` and shapes
      what a model reads when a call fails.
MUST: declare `returns` on every tool, and build a recipe's result field by field in `toMcpRecipe`,
      so `userId`, `sourceUrl` and `chef` cannot leave.
MUST: reuse the app's path for a write: `plan_meal` goes through `planMealTool` and
      [ADR 0013](./0013-a-plate-is-planned-through-one-path.md), never its own insert.
MUST: name the day with one `dateTime` in ISO 8601 with its UTC offset, read by `cookClockOf`, which
      refuses `Z`, an offset outside −12 to +14 hours, and a day in the past or past `PLANNABLE_DAYS`.
MUST: revoke a cook's connections in `purgeUser`, on both outcomes, through `revokeConnectionsOf`.
      `CASCADE` cannot reach them: the component keeps them under a string.
MUST: read which assistant is asking from the redirect host on the approval screen. The client's
      name is its own claim, and marked as one.
MUST NOT: declare `userId`, `householdId` or `locale` in a tool's `args`. Who is asking is not the
          model's to say, and every tool reads and answers in English (`MCP_LOCALE`).
MUST NOT: export `createApiKey`, or turn the device flow on. A cook connects through `/connect` and
          holds no API key. `createApiKeyForUser` stays internal, for deploy credentials.
MAY: send an image as a block as well as a link, through `withImage`. Agents' chats do not load
     pictures from a URL. An image that cannot be read in time costs the picture, never the result.

## Why

A tool's arguments are written by a model, and what a model reads includes text other cooks wrote
([ADR 0014](./0014-a-recipe-is-readable-by-any-cook.md)). An argument saying who is asking would let
a recipe's description aim a plate at another household. So identity comes from the token alone, and
the only write lands on the caller's own household, where the cook can see it.

`runTool` is the one gate because the component has no hook ahead of a tool, and a handler is to
`/mcp` what an `authed` export is to the app. `mcpCall` is not paid work, so ADR 0018 does not ask
for it: it exists to bound a looping model or a leaked token until the connection is revoked.

The `dateTime` carries its own offset because the server stores no timezone and an agent already
knows the cook's. `cookClockOf` compares it with the server's clock, so an impossible date reads as
a sentence rather than a plate on the wrong day. Its two `@limitation`s are the clock-change cases.

## Verify

`pnpm test`. `convex/__tests__/mcp.test.ts` walks `tools/list`, so a tool added later is covered
without a new test: no tool's `args` declare `userId`, `householdId` or `locale`, every tool refuses
on a drained bucket with nothing read or written (a tool that skips `runTool` fails it), and
`mcp.lint()` is empty. `convex/router/users/__tests__/purge.test.ts` pins the revocation on both
outcomes, past the component's list of 200.

The approval screen is on the showcase website, which has no tests: its logo rule is held by review alone.

## See also

[0013](./0013-a-plate-is-planned-through-one-path.md): the path `plan_meal` reuses ·
[0014](./0014-a-recipe-is-readable-by-any-cook.md): why a recipe's text is not trusted ·
[0018](./0018-an-expensive-operation-is-rate-limited.md): the refusal `mcpCall` shares
