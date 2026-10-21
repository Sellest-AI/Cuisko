/**
 * The catalog of a deployment, a page at a time, through `exportCatalog._internal`.
 *
 * One loop for the two scripts that read it back: `catalog:export`, which zips it, and
 * `seed:catalog`, which reads the tags each import came out with. The query itself is handed in
 * (`fetchPage`), since `_lib/` is tested without the generated `internal` API.
 */
import type { PaginationOptions, PaginationResult } from "convex/server";

import type { PortableRecipe } from "@convex/schema/recipePayloads";

/**
 * Recipes per page. A recipe ships every ingredient, every locale and its image URLs, so a page is
 * heavy for its size: twenty keeps a query well inside Convex's read and response limits.
 */
export const CATALOG_PAGE_SIZE = 20;

export type FetchCatalogPage = (paginationOpts: PaginationOptions) => Promise<PaginationResult<PortableRecipe>>;

export async function* catalogPagesOf(fetchPage: FetchCatalogPage): AsyncGenerator<PortableRecipe[]> {
  let cursor: string | null = null;

  do {
    const page = await fetchPage({ cursor, numItems: CATALOG_PAGE_SIZE });
    yield page.page;
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
}
