/**
 * C1 — every export in convex/router/ must name its own access level, and the builder must
 * actually enforce that level.
 *
 * This is the single most valuable check in the repo. The predecessor project shipped
 *
 *     export const admin = authQuery({ args: { userId: v.id("users") } })
 *
 * twice. The name promised an admin check the builder never performed, `userId` came from the
 * caller, and any signed-in user could read any other user's data. Nothing caught it for the
 * life of the project, because nothing was looking.
 */
import path from "node:path";

import { lineOf, listFiles, parse, relative, report, ROOT, ts } from "./_lib.mjs";

const GRAMMAR = /^(anon|authed|admin|server|_internal(_[a-z][a-zA-Z0-9]*)?)$/;

const ALLOWED_BUILDERS = {
  anon: [
    "publicQuery",
    "publicMutation",
    "publicAction",
    "publicQueryI18n",
    "publicMutationI18n",
    "publicActionI18n",
  ],
  authed: [
    "authQuery",
    "authMutation",
    "authAction",
    "ownedQuery",
    "ownedMutation",
    "householdQuery",
    "householdMutation",
    "authQueryI18n",
    "authMutationI18n",
    "authActionI18n",
    "ownedQueryI18n",
    "ownedMutationI18n",
    "householdQueryI18n",
  ],
  admin: [
    "adminQuery",
    "adminMutation",
    "adminAction",
    "adminQueryI18n",
    "adminMutationI18n",
    "adminActionI18n",
  ],
  server: ["serverQuery", "serverMutation", "serverAction"],
  _internal: ["internalQuery", "internalMutation", "internalAction"],
};

const accessLevelOf = (name) => (name.startsWith("_internal") ? "_internal" : name);

/** Unwraps `ownedMutation("recipes")({ … })` down to the identifier `ownedMutation`. */
const rootCallee = (node) => {
  let current = node;
  while (ts.isCallExpression(current)) current = current.expression;
  return ts.isIdentifier(current) ? current.text : null;
};

const isExported = (node) =>
  node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

const findings = [];

for (const file of listFiles(path.join(ROOT, "convex", "router"))) {
  if (file.endsWith(".test.ts")) continue;

  const source = parse(file);
  const at = (node) => ({ file: relative(file), line: lineOf(source, node) });

  for (const statement of source.statements) {
    // Types carry no access level — only values are registered by Convex.
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      const name = ts.isIdentifier(declaration.name) ? declaration.name.text : null;

      if (!name || !GRAMMAR.test(name)) {
        findings.push({
          ...at(declaration),
          message: `export \`${name ?? "<destructured>"}\` is not part of the export grammar.`,
          fix: "Rename to anon · authed · admin · server · _internal · _internal_<verb>.",
        });
        continue;
      }

      const level = accessLevelOf(name);
      const allowed = ALLOWED_BUILDERS[level];

      if (!declaration.initializer || !ts.isCallExpression(declaration.initializer)) {
        findings.push({
          ...at(declaration),
          message: `export \`${name}\` is not a procedure builder call.`,
          fix: `Assign one of: ${allowed.join(", ")}.`,
        });
        continue;
      }

      const builder = rootCallee(declaration.initializer);

      if (!builder || !allowed.includes(builder)) {
        findings.push({
          ...at(declaration),
          message:
            `export \`${name}\` uses \`${builder ?? "an unknown builder"}\`, which does not ` +
            `enforce the \`${level}\` access level.`,
          fix: `Use one of: ${allowed.join(", ")}.`,
        });
      }
    }
  }
}

report("C1 export name matches its builder", findings);
