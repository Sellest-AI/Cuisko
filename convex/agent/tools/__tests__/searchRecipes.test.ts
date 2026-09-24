import type { Id } from "@convex/_generated/dataModel";
import { describe, expect, it, vi } from "vitest";

import { searchRecipesTool } from "../searchRecipes";

type Ctx = Parameters<ReturnType<typeof searchRecipesTool>["run"]>[0];

/**
 * A ctx whose search answers from a table of term → titles, and records each term it was asked.
 * The ranking is `searchForUser`'s and pinned there; what is tested here is the fan-out around it.
 */
const _ctx = (catalog: Record<string, string[]>) => {
  const runQuery = vi.fn(async (_ref: unknown, { query }: { query: string }) =>
    (catalog[query] ?? []).map((title) => ({ id: `id-${title}`, title, extra: "not for the model" })),
  );
  return { ctx: { runQuery } as unknown as Ctx, runQuery };
};

const _search = (ctx: Ctx, queries: string[]) =>
  searchRecipesTool({ userId: "user" as Id<"users">, locale: "fr" }).run(ctx, { queries });

describe("searchRecipesTool", () => {
  it("answers each name beside what it found, best match first, empty when nothing matched", async () => {
    const { ctx } = _ctx({ "gnocchis poêlés": ["gnocchis au pesto", "gnocchis à la sauge"] });

    expect(await _search(ctx, ["gnocchis poêlés", "pizza"])).toEqual([
      {
        query: "gnocchis poêlés",
        recipes: [
          { id: "id-gnocchis au pesto", title: "gnocchis au pesto" },
          { id: "id-gnocchis à la sauge", title: "gnocchis à la sauge" },
        ],
      },
      { query: "pizza", recipes: [] },
    ]);
  });


  it("searches a repeated or padded name once", async () => {
    const { ctx, runQuery } = _ctx({ pizza: ["pizza margherita"] });

    const found = await _search(ctx, ["pizza", " pizza ", "pizza"]);

    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(found.map(({ query }) => query)).toEqual(["pizza"]);
  });

  it("skips a name that is only spaces", async () => {
    const { ctx, runQuery } = _ctx({});

    expect(await _search(ctx, ["   "])).toEqual([]);
    expect(runQuery).not.toHaveBeenCalled();
  });
});
