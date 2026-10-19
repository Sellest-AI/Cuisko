/**
 * The paging both catalog scripts share: every page in order, and the cursor handed back as the
 * deployment gave it, so a run that reads the catalog reads all of it once.
 */
import type { PortableRecipe } from "@convex/schema/recipePayloads";
import type { PaginationOptions } from "convex/server";
import { describe, expect, it } from "vitest";

import { CATALOG_PAGE_SIZE, catalogPagesOf, type FetchCatalogPage } from "../catalogPages";

const _recipe = (recipeId: string) => ({ origin: { recipeId, creationTime: 0 } }) as PortableRecipe;

describe("catalogPagesOf", () => {
  it("yields every page in order, following the cursor until the last one", async () => {
    const pages = [
      { page: [_recipe("r1"), _recipe("r2")], isDone: false, continueCursor: "after-r2" },
      { page: [_recipe("r3")], isDone: true, continueCursor: "end" },
    ];
    const asked: PaginationOptions[] = [];
    const fetchPage: FetchCatalogPage = async (paginationOpts) => {
      asked.push(paginationOpts);
      return pages[asked.length - 1]!;
    };

    const ids: string[][] = [];
    for await (const page of catalogPagesOf(fetchPage)) ids.push(page.map(({ origin }) => origin.recipeId));

    expect(ids).toEqual([["r1", "r2"], ["r3"]]);
    expect(asked).toEqual([
      { cursor: null, numItems: CATALOG_PAGE_SIZE },
      { cursor: "after-r2", numItems: CATALOG_PAGE_SIZE },
    ]);
  });
});
