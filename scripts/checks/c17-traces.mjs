/**
 * C17 — a paid call is traced to the route it was made for.
 *
 * `recordGeneration` sends a call's cost to PostHog under `ctx.trace.operation`, and when there is
 * no trace it only logs: tracing never fails the cook's operation, so a missing one is silent in
 * use. The trace exists only if two explicit things happened, and nothing else forces either, so
 * this check does (ADR 0019):
 *
 *  1. **The route starts one.** A router entry point (`anon` / `authed` / `admin` / `server`, made
 *     with a mutation or action builder) whose imports reach a paid service (`PAID`), or that
 *     references an action marked `@costly`, passes `trace: "<operation>"` to its builder. Queries
 *     are exempt: they never spend, and no query builder takes the option.
 *  2. **Every hop carries it.** A `@costly` action is reached through `ctx.runTracedAction` or
 *     `ctx.scheduleTracedAfter`, never `ctx.runAction` / `ctx.scheduler.runAfter` / `runAt`, which drop
 *     the trace on the floor. Checked in every file under `convex/`, since a helper in `functions/`
 *     schedules as readily as a router does.
 *
 * "Reach" is C16's (`_costs.mjs`), so the two checks cannot disagree on what costs money. A route
 * reaching a cost is a finding until it is traced, or listed in PENDING with the reason.
 */
import path from "node:path";

import {
  closureOf,
  CONVEX,
  costlyExports,
  exportsOf,
  PAID,
  referencesOf,
  referenceTarget,
  routerFiles as listRouterFiles,
  startsWithAny,
} from "./_costs.mjs";
import { lineOf, listFiles, parse, relative, report, ts } from "./_lib.mjs";

/** The exports a client, an admin or a server calls directly: where a trace starts. */
const ENTRY_POINTS = new Set(["anon", "authed", "admin", "server"]);

/** A builder that takes the `trace` option. Every mutation and action builder does; no query builder does. */
const _isTraceable = (builder) => !!builder && /(Mutation|Action)(I18n)?$/.test(builder);

/**
 * Files not traced yet, each with why, as `[path, reason]`. Empty, and meant to stay so: a file here
 * is a known gap in the cost data, and adding one is the review.
 */
const PENDING = new Map([]);

const _hasTrace = (definition) =>
  !!definition?.properties.some(
    (property) => property.name && ts.isIdentifier(property.name) && property.name.text === "trace",
  );

const findings = [];
const routerFiles = listRouterFiles();
const costly = costlyExports(routerFiles);

/* Rule 1: a route that reaches a cost starts a trace. */
for (const file of routerFiles) {
  const name = relative(file);
  if (PENDING.has(name)) continue;

  const closure = [...closureOf(file)];
  const vendor = closure.map(relative).find((reached) => startsWithAny(reached, PAID));
  const reference = closure
    .flatMap((reached) => referencesOf(reached))
    .find(({ file: target, exportName }) => costly.has(`${relative(target)}#${exportName}`));
  if (!vendor && !reference) continue;

  for (const entry of exportsOf(file)) {
    if (!ENTRY_POINTS.has(entry.name) || !_isTraceable(entry.builder) || _hasTrace(entry.definition)) continue;

    findings.push({
      file: name,
      line: lineOf(parse(file), entry.statement),
      message: vendor
        ? `\`${entry.name}\` reaches \`${vendor}\` and starts no trace; what it spends would be recorded nowhere, with only a log line to say so.`
        : `\`${entry.name}\` calls \`${relative(reference.file)}\` \`${reference.exportName}\`, marked \`@costly\`, and starts no trace.`,
      fix: `Pass \`trace: "<operation>"\` to \`${entry.builder}\`, with an operation from OPERATIONS in convex/schema/tracing.ts, or add the file to PENDING in scripts/checks/c17-traces.mjs with the reason.`,
    });
  }
}

/** The call that drops a trace, and the reference argument's position in it. */
const UNTRACED_CALLS = { runAction: 0, runAfter: 1, runAt: 1 };

/* Rule 2: a hop to a `@costly` action carries the trace. */
const sources = listFiles(CONVEX).filter(
  (file) => !file.endsWith(".test.ts") && !file.split(path.sep).includes("_generated"),
);
for (const file of sources) {
  const name = relative(file);
  if (PENDING.has(name)) continue;

  const source = parse(file);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const position = UNTRACED_CALLS[method];
      const argument = position === undefined ? undefined : node.arguments[position];
      const target = argument && ts.isPropertyAccessExpression(argument) ? referenceTarget(argument) : undefined;

      if (target && costly.has(`${relative(target.file)}#${target.exportName}`)) {
        findings.push({
          file: name,
          line: lineOf(source, node),
          message: `\`${method}\` reaches \`${relative(target.file)}\` \`${target.exportName}\`, marked \`@costly\`, without the caller's trace; its cost would be recorded nowhere, with only a log line to say so.`,
          fix:
            method === "runAction"
              ? "Call `ctx.runTracedAction(ref, args)` instead."
              : "Call `ctx.scheduleTracedAfter(delayMs, ref, args)` instead.",
        });
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(source);
}

report("C17 paid calls are traced to their route (ADR 0019)", findings);
