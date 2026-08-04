// The architectural rules live here. Every one of them exists because the equivalent rule was
// written down in the predecessor project and broken anyway — see architecture/02-DIVERGENCE.md.
// A rule with no mechanism is a guideline; these are the ones with a mechanism.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  ...expoConfig,

  {
    ignores: [
      "convex/_generated/**",
      "dist/**",
      ".expo/**",
      "android/**",
      "ios/**",
      "node_modules/**",
    ],
  },

  // Path aliases are resolved by tsc and Metro, not by eslint-plugin-import. Without a
  // resolver these rules only produce false positives.
  {
    rules: {
      "import/namespace": "off",
      "import/no-unresolved": "off",
      "import/named": "off",
      "import/default": "off",
      "import/no-named-as-default": "off",
      "import/no-named-as-default-member": "off",
    },
  },

  // ⚠️ In flat config, a later block that sets `no-restricted-imports` REPLACES an earlier
  //    one for any file both match — the options do not merge. So every scope below owns
  //    exactly one `no-restricted-imports` block, and overlapping scopes are separated with
  //    `ignores`. Adding a block that matches an already-covered path silently disables the
  //    rule that was protecting it; verify with `npx eslint <a violating file>` when in doubt.

  // ── R1 — src/ui/ is isolated ─────────────────────────────────────────────────────────────
  // The design system must not know the backend exists. Structural prop types are what make
  // this free to obey: a component that declares the shape it needs has no reason to import
  // `Doc<'recipes'>`. The `**/convex/**` pattern also covers R3 for these files.
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["convex", "convex/*", "**/convex/**", "~/lib/convex/*"],
              message:
                "src/ui/ must not know the backend exists. Declare a structural prop type instead.",
            },
            {
              group: ["~/modules/*", "~/providers/*", "~/hooks/*", "translations", "translations/*"],
              message: "src/ui/ must not depend on application layers.",
            },
          ],
        },
      ],
    },
  },

  // ── R2 — only procedures.ts touches _generated/server ────────────────────────────────────
  // NOTE: _generated/API is deliberately NOT restricted here. Router files legitimately need
  // `internal` and `api`, and those cannot come from procedures.ts without creating the type
  // cycle described at the top of that file. Restricting the wrong module is precisely what
  // collapsed this rule before.
  {
    files: ["convex/**/*.ts"],
    // `convex/router/**` is excluded because R7 below restates this pattern alongside its own.
    // Without that exclusion R7 would REPLACE this block for router files and silently unban
    // `_generated/server` there — the exact failure the header warns about.
    ignores: ["convex/_generated/**", "convex/procedures.ts", "convex/router/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/_generated/server"],
              message: "Import builders and ctx types from convex/procedures.ts.",
            },
          ],
        },
      ],
    },
  },

  // ── R7 — ownership is a capability, not a call (+ R2, restated for router/) ──────────────
  // `isAuthorized` owns the ownership RULES; `ownedQuery` / `ownedMutation` guarantee they are
  // APPLIED. A router file that calls the helper directly has opted out of that guarantee and is
  // back to "remembered check" — which the predecessor applied in 7 of 22 places.
  {
    files: ["convex/router/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/_generated/server"],
              message: "Import builders and ctx types from convex/procedures.ts.",
            },
            {
              group: ["**/functions/users/isAuthorized", "**/functions/users/isAuthorized.js"],
              message:
                "router/ never calls isAuthorized directly — use ownedQuery('<table>') / " +
                "ownedMutation('<table>'), which apply it for you. Direct calls belong in functions/.",
            },
          ],
        },
      ],
    },
  },

  // ── R2b — procedures.ts must stay OUT of the api type cycle ──────────────────────────────
  {
    files: ["convex/procedures.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/_generated/api"],
              message:
                "procedures.ts must never import _generated/api — it creates a project-wide type " +
                "cycle. Use makeFunctionReference() for internal function references.",
            },
          ],
        },
      ],
    },
  },

  // ── R3 — only src/lib/convex/api.ts reaches the generated API ────────────────────────────
  // `src/ui/**` is excluded because R1 already bans a superset for it; `app/**` is excluded
  // because R4 below restates this pattern alongside its own.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/convex/api.ts", "src/ui/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/convex/_generated/**"],
              message: "Import from ~/lib/convex/api instead.",
            },
          ],
        },
      ],
    },
  },

  // ── R4 — screens do not fetch (+ R3, restated: this block replaces it for app/**) ────────
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/convex/_generated/**"],
              message: "Import from ~/lib/convex/api instead.",
            },
          ],
          paths: [
            {
              name: "~/lib/convex/client",
              message:
                "Screens call a feature hook from src/modules/*/_hooks/. They do not fetch.",
            },
            {
              name: "~/lib/convex/api",
              message: "Screens never touch `api`. The module's hook owns the Convex bindings.",
            },
            {
              name: "convex/react",
              message:
                "Screens call a feature hook from src/modules/*/_hooks/. They do not fetch.",
            },
          ],
        },
      ],
    },
  },

  // ── R5 — webhooks must be verified ───────────────────────────────────────────────────────
  {
    files: ["convex/**/*.ts"],
    ignores: ["convex/http/verified.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='httpAction']",
          message: "Use verifiedWebhook() from convex/http/verified.ts — verification is not optional.",
        },
      ],
    },
  },

  // ── R6 — no silently swallowed errors ────────────────────────────────────────────────────
  {
    rules: {
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
]);
