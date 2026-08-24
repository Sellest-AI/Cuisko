import type { Doc } from "@convex/_generated/dataModel";
import { resolvei18n } from "@convex/lib/i18n";
import type { Locale } from "@convex/schema/i18n";

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
};

export const toCatalogIngredient = (
  ingredient: Doc<"ingredients">,
  locale: Locale,
): CatalogIngredient => {
  const { name, aliases, search, ...rest } = ingredient;

  return { ...rest, name: resolvei18n(name, locale), aliases: aliases?.[locale] };
};
