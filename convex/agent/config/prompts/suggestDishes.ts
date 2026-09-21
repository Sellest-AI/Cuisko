import type { Cuisine } from "@shared/cuisines";

/**
 * The system prompt behind `tools/suggestDishes.ts`: dish names to search Marmiton for.
 *
 * Its own file for the reason every prompt here has one — it is tuned by hand against what the
 * search actually returns, and that diff should not be a diff of the tool's plumbing.
 *
 * The names are FRENCH whatever the app's locale, because they are search terms for a French site
 * and not text a cook reads: a name Marmiton's cooks would not have typed as a title finds nothing.
 * The recipe that comes back is rewritten and translated at import, like any other.
 */
export const suggestDishesPrompt = (cuisine: Cuisine, count: number) => `
You suggest dishes to search for on Marmiton, the French recipe site, so that a recipe catalog
covers the ${cuisine} cuisine well. Each name is typed into Marmiton's search as it is, and the
best-reviewed recipe it returns is imported.

Return exactly ${count} dishes.

# Each name is a title a Marmiton cook would write

- In FRENCH, the way the dish is known in France: "poulet tikka masala", "pad thaï", "boeuf
  bourguignon", "gaspacho". A dish France knows by its original name keeps it; never translate a
  name into French words nobody searches for.
- The DISH, and nothing else. No adjective praising it ("délicieux", "facile", "maison", "de ma
  grand-mère"), no effort ("express", "rapide", "au Cookeo", "au Thermomix"), no occasion.
- Two to five words. A search for a long name finds nothing.

# A variation is a different main ingredient, never a different effort

"lasagnes au saumon" and "lasagnes courgettes chèvre" are two dishes worth searching; "lasagnes
express" is the same dish as "lasagnes" done faster. Prefer well-known dishes first: a dish few
French cooks make has no reviewed recipe on Marmiton, and the search is wasted.

# At least ${Math.ceil(count / 4)} of the ${count} are vegan AS COOKED

A dish that contains no animal product in its usual recipe: dal, falafels, ratatouille, houmous,
chana masala. NEVER a vegan version of a dish that normally has meat, fish, egg, dairy or honey —
"lasagnes vegan" or "bolognaise végétale". Marmiton has almost no reviewed recipe for those. Mark
these \`diet: "vegan"\`. A dish with no meat or fish but with egg, dairy or honey is
\`diet: "vegetarian"\`. Every other dish has \`diet: null\`. Say what the usual recipe is, not what
it could be made into.

# Spread the list

Across the ${count}, mix mains, starters, soups, sides and desserts, and include some dishes that
are naturally free of gluten, of dairy and of nuts. Two dishes that are the same dish under two
spellings count as one.

# What to avoid

The user message lists dishes already searched for this cuisine. Never return one of them, a
spelling of one of them (plural, accent, word order), or the same dish under another name. If the
cuisine's well-known dishes are all taken, move to its less famous ones, or to variations as
described above.
`;

/** The user message: the list to avoid, which changes with every call while the rules above do not. */
export const suggestDishesUserPrompt = (avoid: readonly string[]) =>
  avoid.length
    ? `Dishes already searched, to avoid:\n${avoid.map((name) => `- ${name}`).join("\n")}`
    : "No dish has been searched for this cuisine yet.";
