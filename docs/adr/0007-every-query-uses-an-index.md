---
id: 0007
applies_to: ["convex/**/*.ts", "convex/schema/**/*.ts"]
status: accepted
supersedes: []
---

# Every query reads an index; pagination never filters

MUST: follow every `ctx.db.query()` immediately with `.withIndex()` or `.withSearchIndex()`.
MUST NOT: combine `.filter()` with `.paginate()`. Put the predicate in the index instead.
MUST: name indexes `by_<field>[_and_<field>]`, fields in the same order as the definition.
MUST: ship a new foreign key together with the index its cascade needs **and** its `CASCADE` entry.
MAY: use `.filter()` to narrow an already-indexed, already-small result set.

## Why

**`.filter()` never uses an index.** It is a post-read predicate, and that single fact produces two
different failures.

**1. Scans become outages.** The predecessor ran `.collect()` over a whole table on every delete of a
parent row — with the correct index defined and simply not used. Convex hard-fails a `.collect()`
that exceeds its read limits, so an un-indexed scan is not slow, it is a time bomb that goes off when
the table grows.

**2. `.filter()` + `.paginate()` breaks pagination in a way that looks like a UI bug.** Convex
paginates the *index* read, then applies the filter to that page. A page requested with
`numItems: 24` can return anywhere from 0 to 24 documents **while still reporting `isDone: false`**.
Infinite-scroll UIs that stop on a short page terminate early and silently hide content:

```ts
// ❌ short, unpredictable pages
.withIndex("by_user", q => q.eq("userId", userId))
.filter(q => q.eq(q.field("isPublic"), true))
.paginate(opts)

// ✅ the predicate is in the index
.withIndex("by_public_and_user", q => q.eq("isPublic", true).eq("userId", userId))
.paginate(opts)
```

**Cascades are the same rule seen from the schema side.** A foreign key creates a delete obligation,
and answering "all rows pointing at this id" *requires* an index on that column. The predecessor
orphaned rows in six tables because four of them had no usable index — and a compound index led by
`userId` cannot answer "all rows for this recipe". Declare the index at the moment you declare the
key, or you will discover the gap only when data starts leaking.

## Related schema rules

C4 also enforces that every table declares `updatedAt` (S5) and carries at least one index (S7),
with `@immutable <reason>` / `@singleton <reason>` in the table's leading comment as the sanctioned
exemptions — so an intentional exception is a visible declaration rather than a silent gap.

Checked in review, not mechanically: never store `createdAt` (`_creationTime` exists); polymorphic
references use one `v.union` of ids plus a discriminant, never parallel optional FKs; join tables
carry `position` when order is meaningful. See
[CONVENTIONS §11](../CONVENTIONS.md#11-rules-that-stay--and-why) for why each stays judgement.

## Verify

```bash
pnpm check:queries   # C3 — S1 (index required), S2 (index naming), S3 (no filter+paginate)
pnpm check:schema    # C4 — S10 (cascade index + CASCADE entry), plus S5 and S7
```

## See also

predecessor evidence: F9, F10, F12, F15 — [03-FLAWS.md](../_reference/03-FLAWS.md)
