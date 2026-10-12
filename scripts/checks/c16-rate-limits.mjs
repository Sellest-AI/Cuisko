/**
 * C16 — an operation a signed-in cook can call, and that costs money, is rate limited.
 *
 * `enforceRateLimit` is what keeps one cook from running up the bill (ADR 0018), and it is an
 * explicit call, so the failure it invites is the new `authed` operation that never makes it. A
 * builder could not be forgotten, but `procedures.ts` may not import `_generated/api` (ADR 0001) and
 * the limiter needs it, so the guarantee is this check instead.
 *
 * What costs money is found two ways, because an operation reaches it two ways:
 *
 *  1. By import. An `authed` / `admin` router file whose imports reach a model, a scraper or the
 *     storage (`VENDORS`) must also import `enforceRateLimit`.
 *  2. By reference. A paid `internal` action is marked `@costly`; an `authed` file whose imports
 *     reach a `@costly` export through `internal.<path>.<export>` must import the guard too. That is
 *     how an operation hands its work to an action (`importOne` to `importOneNode`), and no import
 *     shows it. The marker keeps it exact: following every reference instead flagged a dozen
 *     operations for deleting an image's files, which no cook can run up a bill with.
 *
 * And the marker has to be trustworthy, so:
 *
 *  3. An `internalAction` in a router file whose imports reach a PAID vendor (`PAID`) carries
 *     `@costly`. Only an action can call out, so only an action needs the tag.
 *  4. Every limit in `RATE_LIMITS` is applied somewhere: a limit nothing applies is a promise to the
 *     cook, and to us, that nothing keeps.
 *
 * "Imports reach" is the closure of static, value imports: it proves the guard is in the operation's
 * own graph, not that it runs first or on every branch. That is each endpoint's refusal test. It
 * fails closed where it can see: a new operation reaching a cost is a finding until it is rate
 * limited, or is added to ALLOWLIST with the reason.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { closureOf, CONVEX, exportsOf, PAID, referencesOf, routerFiles as listRouterFiles, startsWithAny } from "./_costs.mjs";
import { lineOf, listFiles, parse, relative, report } from "./_lib.mjs";

const GUARD = "convex/functions/rateLimits/enforceRateLimit.ts";

/** `PAID`, and the storage a cook can fill. Deleting from it is not a cost, so it is not in `PAID`. */
const VENDORS = [...PAID, "convex/lib/s3/", "convex/lib/media/"];

/**
 * Router files that reach a vendor and deliberately have no rate limit. Adding one here is the review:
 * say why the cook's own call is not the one that costs.
 */
const ALLOWLIST = new Map([
  // Imports the assistant agent to READ a stored transcript. It is a query: no model runs.
  ["convex/router/assistant/listMessages.ts", "reads a thread; never calls the model"],
]);

const findings = [];

const routerFiles = listRouterFiles();

/** Rule 3: a paid `internalAction` says so, so rule 2 can see it. */
const costly = new Set();
for (const file of routerFiles) {
  const name = relative(file);
  const imported = [...closureOf(file)].map(relative);
  const reachesPaid = imported.some((reached) => startsWithAny(reached, PAID));

  for (const { name: exportName, statement, isAction, isCostly } of exportsOf(file)) {
    if (isCostly) costly.add(`${name}#${exportName}`);
    if (!isAction || isCostly || !reachesPaid) continue;

    findings.push({
      file: name,
      line: lineOf(parse(file), statement),
      message: `\`${exportName}\` is an internal action whose imports reach a paid service, and it is not marked \`@costly\`; an \`authed\` operation calling it would go unchecked.`,
      fix: "Add `@costly` to its doc comment, so C16 can require every `authed` caller to be rate limited.",
    });
  }
}

for (const file of routerFiles) {
  const source = parse(file);
  const entry = exportsOf(file).find(({ name }) => name === "authed" || name === "admin");
  if (!entry) continue;

  const name = relative(file);
  if (ALLOWLIST.has(name)) continue;

  const closure = [...closureOf(file)];
  const imported = closure.map(relative);
  if (imported.includes(GUARD)) continue;

  /* Rule 1: it imports a cost. */
  const vendor = imported.find((reached) => startsWithAny(reached, VENDORS));

  /* Rule 2: it references a `@costly` action. */
  const reference = closure
    .flatMap((reached) => referencesOf(reached))
    .find(({ file: target, exportName }) => costly.has(`${relative(target)}#${exportName}`));

  if (!vendor && !reference) continue;

  findings.push({
    file: name,
    line: lineOf(source, entry.statement),
    message: vendor
      ? `an \`authed\` operation reaches \`${vendor}\` and never reaches \`enforceRateLimit\`; one cook could run it without limit.`
      : `an \`authed\` operation calls \`${relative(reference.file)}\` \`${reference.exportName}\`, marked \`@costly\`, and never reaches \`enforceRateLimit\`; one cook could run it without limit.`,
    fix:
      "Call `enforceRateLimit(ctx, kind)` (or `withRateLimit(...)`) from `functions/rateLimits/enforceRateLimit.ts` before the paid work runs, " +
      "with a kind from RATE_LIMITS, or add the file to ALLOWLIST in scripts/checks/c16-rate-limits.mjs with the reason.",
  });
}

/* Rule 4: a limit nothing applies. */
const LIMITS = path.join(CONVEX, "lib", "rateLimits.ts");
if (existsSync(LIMITS)) {
  const limits = readFileSync(LIMITS, "utf8");
  const kinds = [...limits.matchAll(/^\s+(\w+): \{ kind:/gm)].map((match) => match[1]);

  const sources = listFiles(CONVEX)
    .filter((file) => !file.endsWith(".test.ts") && file !== LIMITS)
    .map((file) => readFileSync(file, "utf8"));

  for (const kind of kinds) {
    const call = new RegExp(`\\b(?:enforceRateLimit|withRateLimit)\\([^;]*?["']${kind}["']`);
    if (sources.some((text) => call.test(text))) continue;

    findings.push({
      file: relative(LIMITS),
      line: limits.slice(0, limits.indexOf(`  ${kind}: {`)).split("\n").length,
      message: `\`${kind}\` is in RATE_LIMITS and no operation applies it.`,
      fix: "Apply it from the operation it limits, or delete the entry.",
    });
  }
}

report("C16 costly operations are rate limited (ADR 0018)", findings);
