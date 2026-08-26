---
id: 0010
applies_to:
  [
    "convex/agent/**/*.ts",
    "convex/functions/ingredients/matchIngredients.ts",
    "shared/ingredientMatch.ts",
    "shared/cuisines.ts",
    "shared/tags.ts",
    "convex/schema/recipes.ts",
  ]
status: accepted
supersedes: []
---

# A model returns names and vocabulary, never ids and never free text

MUST: build a tool's output schema from the shared `as const` vocabularies — `z.enum(UNITS)`,
`z.enum(CUISINES)`, `z.literal(DIFFICULTY_LEVELS)` — for every field the database constrains.
MUST NOT: type such a field as `z.string()`, `z.number()` or `z.array(z.string())`.
MUST: assert the tool's inferred output against its hand-written TypeScript type, so a vocabulary
that drifts from the schema fails to compile.
MUST NOT: ask a model for a `v.id()`, or for anything else that identifies a row. A model asked for
a document id invents one that parses.
MUST: resolve a name to a row in code, in a function testable with no model in the loop.
MUST: gate auto-linking a resolved row on a named threshold whose number is justified, in a comment
beside it, by a fixture that runs against the real catalog.
MUST: store a field a model writes as a closed vocabulary whenever its natural value is a word that
changes with the locale — cuisine, tags. See S11/S12 in [../CONVENTIONS.md](../CONVENTIONS.md).
MAY: return a name the catalog does not hold. Unresolved is a state the caller renders; a wrong
link is not.

## Why

**Both halves of this record are about a failure that produces no error.**

A model asked for `ingredientId` returns a plausible 32-character string. It validates as an id, it
inserts, and the recipe then carries a row that does not exist or — worse — a row that does and is
the wrong ingredient. Nothing throws. The recipe's nutrition total is wrong and its grocery line
buys the wrong thing, and the first symptom is a cook noticing. So the model returns the *name*,
and `matchIngredients` turns names into ids by searching and ranking — an algorithm, which can be
run against the seeded catalog in a test that takes 900 ms and costs nothing.

That ranking exists because Convex's search index returns rows in relevance order and **no score**:
at the call site, "nothing matched" and "a bad match ranked first" are the same answer. `CONFIDENT`
is the number that separates them, and it is meaningless unless it was measured — hence the fixture
requirement rather than a taste-based constant.

The vocabulary half is the same failure at the schema. A model runs in one locale, so a free-string
`cuisine` stores "italienne" from a French cook and "Italian" from an English one: two recipes of
one cuisine that never group, never filter and never match, with no symptom until the app holds both
locales — long after the rows are written. A closed list makes the stored value locale-free and the
displayed word a translation key, and `tags` needs it twice over, since no filter UI can be built
against a column whose values are not known in advance.

## Verify

`pnpm typecheck` — the `Exact<z.infer<typeof _sanitizedRecipe>, SanitizedRecipe>` check in
`convex/agent/tools/sanitizeRecipe.ts` fails to compile when a vocabulary drifts.

`pnpm test -- convex/functions/ingredients/__tests__/matchIngredients.test.ts` — seeds the real
catalog and pins both sides of `CONFIDENT`: every realistic recipe line resolves to its row, and an
ingredient the catalog does not hold comes back unmatched rather than linked to its nearest spelling.
