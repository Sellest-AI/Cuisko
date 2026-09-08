import type { Doc } from "@convex/_generated/dataModel";
import { resolvei18n } from "@convex/lib/i18n";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { type GetImageDoc, getImage } from "../media/getImage";

/**
 * An ingredient as the catalog hands it out: its name and its synonyms in the caller's locale,
 * and without the one field that exists only so the server can find the row.
 *
 * `aliases` is resolved the same way `name` is, because the client ranks what the search returns —
 * it is what makes "patates" score against pommes de terre rather than against nothing, and what
 * keeps "chips de patates" from stealing the match. Only the caller's own language is sent: the
 * other one could never match anything the caller typed.
 *
 * `search` is dropped. It is a denormalized blob of every spelling and every accent-stripped copy
 * of it — a few hundred bytes per row, twelve rows per keystroke — and it exists for the index,
 * not for anyone downstream.
 */
export type CatalogIngredient = Omit<Doc<"ingredients">, "name" | "aliases" | "search"> & {
  name: string;
  aliases?: string[];
  image?: NonNullable<GetImageDoc>;
};

/** The catalog only ever reads rows — see `ImageCtx` in `functions/media/getImage.ts`. */
type CatalogCtx = Pick<QueryCtx, "db">;

export const toCatalogIngredient = (
  ingredient: Doc<"ingredients">,
  locale: Locale,
  image?: GetImageDoc,
): CatalogIngredient => {
  const { name, aliases, search, ...rest } = ingredient;

  // `getImage` answers `null` for an id that no longer resolves; the field is left absent instead,
  // so a deleted image and an ingredient that never had one read the same to the client.
  return {
    ...rest,
    name: resolvei18n(name, locale),
    aliases: aliases?.[locale],
    image: image ?? undefined,
  };
};

/**
 * `toCatalogIngredient`, with the image read for you.
 *
 * The image lives in its own table (plus a row per size), so it costs a read the plain conversion
 * cannot make on its own. Every caller handing an ingredient to a client wants it — the
 * suggestion list, the grocery grid, the ingredient sheet — which is why this, and not the bare
 * conversion, is what they call. A row with no `imageId` skips the read entirely.
 */
export const loadCatalogIngredient = async (
  ctx: CatalogCtx,
  ingredient: Doc<"ingredients">,
  locale: Locale,
): Promise<CatalogIngredient> =>
  toCatalogIngredient(
    ingredient,
    locale,
    ingredient.imageId ? await getImage(ctx, ingredient.imageId) : undefined,
  );

/**
 * The same, over a list. The reads run together rather than row by row: a screenful of
 * suggestions is twelve ingredients, and twelve images awaited in sequence is twelve round trips
 * under a text field somebody is still typing in.
 */
export const loadCatalogIngredients = (
  ctx: CatalogCtx,
  ingredients: Doc<"ingredients">[],
  locale: Locale,
): Promise<CatalogIngredient[]> =>
  Promise.all(ingredients.map((ingredient) => loadCatalogIngredient(ctx, ingredient, locale)));
