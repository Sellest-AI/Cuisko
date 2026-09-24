---
id: 0010
applies_to:
  [
    "convex/agent/**/*.ts",
    "convex/functions/ingredients/resolveIngredient.ts",
    "convex/functions/recipes/resolveRecipeIngredients.ts",
    "shared/ingredientMatch.ts",
    "shared/cuisines.ts",
    "shared/tags.ts",
    "convex/schema/recipes.ts",
  ]
status: accepted
supersedes: []
---

# A model returns names and vocabulary, never a composed id and never free text

MUST: build a tool's output schema from the shared `as const` vocabularies — `z.enum(UNITS)`,
`z.enum(CUISINES)`, `z.literal(DIFFICULTY_LEVELS)` — for every field the database constrains.
MUST NOT: type such a field as `z.string()`, `z.number()` or `z.array(z.string())`.
MUST: assert the tool's inferred output against its hand-written TypeScript type, so a vocabulary
that drifts from the schema fails to compile.
MUST NOT: ask a model to compose a `v.id()`, or anything else that identifies a row, and MUST NOT
store an id a model wrote as a link. A model asked for a document id invents one that parses.
MUST: resolve a name to a row in code, in a function testable with no model in the loop.
MAY: let a conversational agent carry ids a tool handed it, and pass them to another tool — the
assistant searches by name, holds the ids that came back, and hands them to its display tool.
MUST: the receiving tool re-validates every id in code — the row exists and the caller may read it
— and THROWS on one that fails. It never drops a bad id silently.
MUST NOT: let an id reach the user in message text. Ids travel only inside tool parts, which the
client reads structurally.
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
and `resolveIngredient` turns a name into an id by searching and ranking — an algorithm, which can
be run against the seeded catalog in a test that takes 900 ms and costs nothing. Where a name
survives every search, the ranker is still handed a LIST and answers with one of the options it
was offered — a TypeSafe Choice cannot answer outside its option set — never with an id it composed
itself.

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

**Carrying an id is not composing one, and the difference is where a wrong one lands.** The
failure above is silent because the id is *stored*: it is written as a link and nothing reads it
again until a cook does. An id the assistant passes to a display tool is read back the same
instant, by code, against the rows that exist — a mangled or remembered id fails there, loudly,
and the model sees the error and retries. So the chat agent works with ids, which is the only way
it can say "these three recipes, in this order" without the client re-searching by title. What it
still may not do is write one into its answer: a 32-character string in a reply is noise the cook
cannot use, and the prompt saying so is a request, not a guarantee.

A tool that drops a bad id instead of throwing turns the loud failure back into a silent one — the
row just is not shown, and the model believes it was.

## Verify

`pnpm typecheck` — the `_Pinned` and `_PinnedStep` assertions in
`convex/agent/tools/sanitizeRecipe.ts` (`AssertTrue<Exact<…modelRecipeSchema…, SanitizedRecipe>>`,
helpers in `convex/agent/utils/exact.ts`) fail to compile when a vocabulary drifts in either
direction. `instructions` is pinned apart, minus a step's `hints`: the model may leave those absent,
and `toInstructionGroups` (`shared/recipes.ts`) is what turns that into the `[]` `SanitizedRecipe` holds.
`suggestDishes.ts` pins its output the same way. A return annotation alone is not this check: it
passes when the hand-written type gains a value the schema never offers the model.

`pnpm test -- convex/functions/ingredients/__tests__/searchWidened.test.ts` — seeds the real catalog
and pins both sides of the thresholds: a realistic line resolves to its row, and an ingredient the
catalog does not hold does not come back linked to its nearest spelling.

The carried-id rules land with the assistant's display tool, and are checked by two tests that
arrive in the same slice: the display tool's own test, which pins that an unknown id and an
unreadable one both throw, and `src/modules/assistant/_model/__tests__/chatMessage.test.ts`, which
pins that an id-shaped string never survives into an assistant message's text.
