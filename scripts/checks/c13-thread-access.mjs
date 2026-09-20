/**
 * C13 — a conversation thread is reached only through the audited assistant functions.
 *
 * Threads live in the `@convex-dev/agent` component, not in a table of ours, so the ownership
 * guard ADR 0003 relies on cannot exist for them: `OwnedTable` is keyed off our `TableNames`, and
 * `ownedQuery('threads')` does not type-check. The comparison is written by hand, once, in
 * `convex/functions/assistant/ownedThread.ts`, and everything that reads a thread calls it first.
 *
 * "Everything" is the part nothing enforces. `assistantAgent.listMessages(ctx, { threadId })`
 * answers anyone who names a thread — the component has no idea who our users are — and a
 * `threadId` is a client-supplied string. The first reader written somewhere else, by someone who
 * did not know the chokepoint existed, is a live IDOR on a private conversation, and since threads
 * are never deleted, an id that leaks reads for good. That is the predecessor's "7 of 22" all over
 * again, with a resource the type system cannot see.
 *
 * So the check is structural, not semantic: it cannot tell whether `ownedThread` compares the right
 * field (see ADR 0003, "not enforceable by code"), but it can tell that no file outside the
 * allowlist reaches a thread at all. Same shape as lint R7, and it fails closed — a new reader
 * anywhere else is a finding until it is either routed through the chokepoint or audited and
 * added to the list, in that commit, on purpose.
 */
import path from "node:path";

import { lineOf, listFiles, parse, relative, report, ROOT, ts } from "./_lib.mjs";

/**
 * The only files allowed to touch a thread. Adding one here is the review: it means the new file
 * calls `ownedThread` before any read, and a rejection test says so.
 */
const ALLOWLIST = new Set([
  "convex/functions/assistant/ownedThread.ts",
  "convex/functions/assistant/threadMessages.ts",
  "convex/functions/assistant/openThread.ts",
]);

/**
 * The component itself. Reaching `components.agent.threads.*` is the obvious shape, but
 * `const { threads } = components.agent` and `const c = components.agent; c.threads` reach the same
 * table without ever spelling the chain — so outside the allowlist every mention of the component
 * is a finding, save the one legitimate use: handing it to `new Agent(components.agent, …)`.
 */
const COMPONENT = ["components", "agent"];

const isAgentConstructorArg = (node) =>
  ts.isNewExpression(node.parent) &&
  ts.isIdentifier(node.parent.expression) &&
  node.parent.expression.text === "Agent" &&
  node.parent.arguments?.[0] === node;

/** The `Agent` methods that read a thread by a caller-supplied `threadId`. */
const THREAD_READERS = new Set(["listMessages", "syncStreams", "getThreadMetadata"]);

/** `a.b.c` → `["a", "b", "c"]`, or `null` when any link is not a plain identifier. */
const dottedChain = (node) => {
  if (ts.isIdentifier(node)) return [node.text];
  if (!ts.isPropertyAccessExpression(node)) return null;

  const head = dottedChain(node.expression);
  return head ? [...head, node.name.text] : null;
};

const startsWith = (chain, prefix) =>
  chain.length >= prefix.length && prefix.every((part, i) => chain[i] === part);

/**
 * Only the outermost access is reported: `components.agent.threads.getThread` contains
 * `components.agent.threads` as a child node, and one line is one finding.
 */
const isOutermostAccess = (node) =>
  !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node);

const findings = [];

for (const file of listFiles(path.join(ROOT, "convex"))) {
  if (file.endsWith(".test.ts")) continue;

  const name = relative(file);
  if (ALLOWLIST.has(name)) continue;

  const source = parse(file);

  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && isOutermostAccess(node)) {
      const chain = dottedChain(node);

      if (chain && startsWith(chain, COMPONENT) && !isAgentConstructorArg(node)) {
        findings.push({
          file: name,
          line: lineOf(source, node),
          message:
            `\`${chain.join(".")}\` reaches the agent component without going through ` +
            "`ownedThread`; a caller could read another cook's conversation by passing its id.",
          fix:
            "Call `threadMessages` / `openThread` from convex/functions/assistant, or put the new " +
            "reader beside `ownedThread` and add it to ALLOWLIST in scripts/checks/c13-thread-access.mjs.",
        });
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      THREAD_READERS.has(node.expression.name.text)
    ) {
      findings.push({
        file: name,
        line: lineOf(source, node),
        message:
          `\`${node.expression.getText(source)}\` reads a thread without going through ` +
          "`ownedThread`; a caller could read another cook's conversation by passing its id.",
        fix:
          "Call `threadMessages` / `openThread` from convex/functions/assistant, or put the new " +
          "reader beside `ownedThread` and add it to ALLOWLIST in scripts/checks/c13-thread-access.mjs.",
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
}

report("C13 threads are reached only through ownedThread", findings);
