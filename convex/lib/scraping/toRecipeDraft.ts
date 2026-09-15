import { DEFAULT_SERVINGS, serializeInstructions } from "@shared/recipes";
import { ConvexError } from "convex/values";

/**
 * What a scraped page becomes on its way into the editor's fields.
 *
 * Pure, and deliberately ignorant of `recipe-scrapers`: it takes the shape below rather than that
 * library's `RecipeObject`, so it can be tested in the edge runtime the rest of `convex/` is tested
 * in — the scraper needs Node, and a mapper that imported it would have dragged the whole extractor
 * into a test that only ever wanted to check how a yield becomes a number.
 */

/** One group of lines, named when the page named it. The scraper's shape for both halves. */
type ScrapedGroup = {
  name: string | null;
  items: { value: string }[];
};

/**
 * The fields we ask the scraper for, and the only ones this slice reads.
 *
 * Structural rather than imported: see above. It is a SUBSET on purpose — `author` and `image` are
 * extracted by the library and needed by neither the editor nor us, and asking for them is what
 * makes a page fail (see `importOneNode`).
 */
export type ScrapedRecipe = {
  title: string;
  description: string;
  yields: string;
  ingredients: ScrapedGroup[];
  instructions: ScrapedGroup[];
};

/**
 * The editor's fields, as the cook will first see them.
 *
 * Deliberately the EDITOR's shape and not `createOne`'s args. The two coincide today, and the
 * reason they must not be assumed to is that this draft is going into a form: `title` is required
 * here where `createOne` has it optional, because a text field cannot hold `undefined` and an
 * untitled scrape has to seed `""` for the cook to fill in — where an untitled CREATE means "let
 * the agent name it".
 */
export type RecipeDraft = {
  title: string;
  description: string;
  servings: number;
  /** One line per ingredient. The editor's textarea, which `createOne` splits back on "\n". */
  ingredients: string;
  instructions: string;
  /**
   * The page it came from, canonical. Not set by `toRecipeDraft`, which never sees a URL — the
   * import action attaches it, which keeps this mapper testable against a fixture alone.
   */
  sourceUrl?: string;
};

const _linesOf = (groups: ScrapedGroup[]): string[] =>
  groups.flatMap((group) => group.items.map((item) => item.value.trim()).filter(Boolean));

/**
 * The number of people a yield is written for.
 *
 * The scraper normalizes most yields to "N servings", but not all of them, and a page is free to
 * say "Pour 6 personnes", "Makes 12 cookies" or "A generous bowlful". So this reads the first whole
 * number it can find and takes nothing else on faith — a yield with no number in it is not a
 * servings count we have, and `DEFAULT_SERVINGS` is a better answer than a guess, because the cook
 * is looking straight at the field and can fix it.
 *
 * Capped rather than trusted: "Makes 24 cookies" is a real yield that is not 24 servings, and a
 * page that says 0 has said nothing. The cap is where a servings count stops being plausible as
 * one, not a limit on what the cook may then type.
 */
const _servingsOf = (yields: string): number => {
  const found = /\d+/.exec(yields);
  if (!found) return DEFAULT_SERVINGS;

  const servings = Number(found[0]);

  return servings >= 1 && servings <= MAX_PLAUSIBLE_SERVINGS ? servings : DEFAULT_SERVINGS;
};

const MAX_PLAUSIBLE_SERVINGS = 50;

/**
 * A scrape as the editor's fields, or a refusal.
 *
 * **Ingredient group names are dropped; instruction group names are kept.** That asymmetry is the
 * two fields' formats, not an oversight: `serializeInstructions` has a heading form that survives
 * a re-parse, and the ingredients field has none — so "For the sauce" written into it would be read
 * back as an ingredient called "for the sauce" and resolved against the catalog as food.
 *
 * A page missing both halves throws `UNREADABLE_PAGE` rather than seeding an empty form. Per the
 * plan's §1 that is an expected ending and not a defect: the cook is told the page could not be
 * read and handed the paste form, which is a truthful answer in a way a blank editor is not.
 * A title alone does not count as a recipe — every navigation page on the web has one.
 */
export const toRecipeDraft = (scraped: ScrapedRecipe): RecipeDraft => {
  const ingredients = _linesOf(scraped.ingredients);
  const instructions = scraped.instructions
    .map((group) => ({
      title: group.name?.trim() || undefined,
      steps: group.items.map((item) => item.value.trim()).filter(Boolean),
    }))
    .filter((group) => group.steps.length > 0);

  if (ingredients.length === 0 || instructions.length === 0) {
    throw new ConvexError({
      code: "UNREADABLE_PAGE" as const,
      message: "No recipe could be read on that page",
    });
  }

  return {
    title: scraped.title.trim(),
    description: scraped.description.trim(),
    servings: _servingsOf(scraped.yields),
    ingredients: ingredients.join("\n"),
    instructions: serializeInstructions(instructions),
  };
};
