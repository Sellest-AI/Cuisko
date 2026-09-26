---
id: 0017
applies_to: ["convex/functions/**/*.ts", "convex/router/**/*.ts", "convex/agent/**/*.ts", "convex/schema/recipes.ts"]
status: accepted
supersedes: []
---

# A deleted recipe is archived, and no list reaches it

MUST: delete a cook's recipe by setting `isArchived: true` (`router/recipes/archiveOne`), never by
      removing the row.
MUST: narrow every `query("recipes")` to live rows with `.eq("isArchived", false)`, written inside
      the `withIndex` / `withSearchIndex` callback.
MUST: drop archived rows by hand from a list assembled from ids (`db.get` over a join table, as
      `listFavorites` does).
MUST NOT: gate a read BY ID on `isArchived`. A recipe opened from a meal cooked with it must load.
MAY: read archived rows in a reader listed in C15's `ALLOWLIST`, with the reason it needs them.

## Why

Planned and cooked meals point at their recipe, so removing the row would erase what a household
cooked. The row stays, in every index, and the only thing keeping a deleted recipe off the recipes
page, the search box, the favorites shelf and the planning pool is each of those reads asking for
live rows. A new list that forgets shows deleted recipes again with no error, and no existing test
goes red, because every fixture seeds live rows.

`isArchived` is a boolean beside `status` rather than a third status, because a Convex index reads
equality on a prefix: "generated OR reviewed" is two reads, and a paginated list cannot be one page
of two reads.

## Verify

```bash
pnpm check:recipes   # C15 — every recipe query outside the allowlist narrows to isArchived false
pnpm test            # each list, search and the planning pool leave an archived recipe out; getOne still loads it
```

**What the check can and cannot do.** C15 reads the callback's text, so a narrowing done by a
helper (`live(q)`) fails it even when correct; spell it at the call site. It cannot see a list
built from ids, which is the third rule's to cover, in review and in that list's own test.

## See also

[0007](./0007-every-query-uses-an-index.md): why the narrowing is an index field and not a `.filter()` ·
[0014](./0014-a-recipe-is-readable-by-any-cook.md): reads by id stay open, archived or not
