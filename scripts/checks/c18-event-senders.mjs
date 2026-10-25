/**
 * C18 — a product event is sent by an entry point, never by the domain that made the change.
 *
 * ADR 0019 splits the work: a writer in `convex/functions/` returns what happened, and the router
 * export that called it (or, for sign-in, the Convex Auth callback in `convex/auth.ts`) sends the
 * event. The split is what keeps reporting out of a function shared by several callers, where it
 * would count a plate a new week replaced as one the cook removed, or need an argument that exists
 * only to be reported.
 *
 * Nothing in the types sees it: `captureEvent` takes a ctx any mutation has. So the check is
 * structural, the shape of C13: it reads every import and fails a file outside the allowlist that
 * reaches the sender. Two doors, two lists:
 *
 * - `lib/posthog/captureEvent` (sends a product event) and `lib/posthog/captureException` (sends a
 *   failure to Error tracking): the entry points, `convex/router/**`, `convex/crons/**` (a job's own
 *   body), `convex/http/**` (a webhook) and `convex/auth.ts`. A domain function returns its failure,
 *   as `findWebRecipe` does, and the entry point reports it.
 * - `lib/posthog/client` (the PostHog client itself): `captureEvent.ts`, the one product-event core,
 *   `captureException.ts`, the Error tracking one, and `functions/tracing/recordGeneration.ts`, the
 *   trace layer's `$ai_generation` sender.
 *
 * Every way a file reaches a module counts: an `import`, an `export … from` (a barrel would hand the
 * sender on to the domain), and a dynamic `import()`. A type-only one passes: it cannot send. Tests
 * are skipped: they mock the client.
 */
import path from "node:path";

import { lineOf, listFiles, parse, relative, report, ROOT, ts } from "./_lib.mjs";

const CAPTURE_EVENT = "convex/lib/posthog/captureEvent";
const CAPTURE_EXCEPTION = "convex/lib/posthog/captureException";
const CLIENT = "convex/lib/posthog/client";

/** Who may send a product event: the entry points ADR 0019 names. */
const ENTRY_POINT_DIRS = ["convex/router/", "convex/crons/", "convex/http/"];
const mayCapture = (name) => ENTRY_POINT_DIRS.some((dir) => name.startsWith(dir)) || name === "convex/auth.ts";

/** Who may hold the PostHog client: the three senders, one per kind of event. */
const CLIENT_HOLDERS = new Set([
  "convex/lib/posthog/captureEvent.ts",
  "convex/lib/posthog/captureException.ts",
  "convex/functions/tracing/recordGeneration.ts",
]);

/** An import's target as a repo path without extension, or `null` for a package. */
const targetOf = (file, specifier) => {
  if (specifier.startsWith("@convex/")) return `convex/${specifier.slice("@convex/".length)}`;
  if (!specifier.startsWith(".")) return null;

  return relative(path.resolve(path.dirname(file), specifier)).replace(/\.(ts|js|mjs)$/, "");
};

/**
 * Every module a file reaches at runtime, with the node to report: `import`, `export … from`, and
 * `import()`. Type-only imports and exports are left out, since they vanish at build.
 */
const reachedModules = (source) => {
  const reached = [];

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.importClause?.isTypeOnly) {
      reached.push({ node, specifier: node.moduleSpecifier.text });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.isTypeOnly
    ) {
      reached.push({ node, specifier: node.moduleSpecifier.text });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      reached.push({ node, specifier: node.arguments[0].text });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return reached;
};

const findings = [];

for (const file of listFiles(path.join(ROOT, "convex"))) {
  if (file.endsWith(".test.ts") || file.split(path.sep).includes("__tests__")) continue;

  const name = relative(file);
  const source = parse(file);

  for (const { node: statement, specifier } of reachedModules(source)) {
    const target = targetOf(file, specifier);

    if (target === CAPTURE_EVENT && !mayCapture(name)) {
      findings.push({
        file: name,
        line: lineOf(source, statement),
        message:
          "imports `captureEvent` outside an entry point: a domain function that reports counts its " +
          "change for every caller, and needs the cook as an argument it has no other use for (ADR 0019).",
        fix:
          "Return what happened from the function, and send the event from the entry point that " +
          "called it (a router export, a cron job, a webhook, or the auth callback in convex/auth.ts). To build an event here, return its shape " +
          "(`accountEventOf`, `reportedPlate`) and let the entry point send it.",
      });
    }

    if (target === CAPTURE_EXCEPTION && !mayCapture(name)) {
      findings.push({
        file: name,
        line: lineOf(source, statement),
        message:
          "imports `captureException` outside an entry point: a domain function shared by several " +
          "callers would report the same failure under each, and needs the cook as an argument (ADR 0019).",
        fix:
          "Return the error from the function (`findWebRecipe`'s `error`), and send it from the entry " +
          "point that called it.",
      });
    }

    if (target === CLIENT && !CLIENT_HOLDERS.has(name)) {
      findings.push({
        file: name,
        line: lineOf(source, statement),
        message:
          "imports the PostHog client directly: a capture that skips `captureEvent` skips its declared " +
          "properties (`EventProperties`), its household group and its never-throw (ADR 0019).",
        fix:
          "Send a product event with `captureEvent` from an entry point, or a paid call's cost through " +
          "the trace layer (`recordGeneration`).",
      });
    }
  }
}

report("C18 product events are sent by entry points, never by the domain (ADR 0019)", findings);
