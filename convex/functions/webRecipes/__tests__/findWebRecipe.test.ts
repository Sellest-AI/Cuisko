import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

import type { ScrapedRecipe } from "@convex/lib/scraping/toRecipeDraft";
import { MARMITON_BAR } from "@convex/lib/webRecipes/marmiton";
import { passes } from "@convex/lib/webRecipes/verdicts";

import { type FindWebRecipeDeps, findWebRecipe } from "../findWebRecipe";

/**
 * The chat's web search, proven offline: every dep is a stub, and every search page is cards
 * written in Marmiton's markup. The parser itself is proven against saved pages in
 * `lib/webRecipes/__tests__/marmiton.test.ts`; what is under test here is the order of the steps,
 * the bar and the event.
 */
type Card = { slug: string; title: string; rating?: number; reviews?: number };

/** One search result in the shape Marmiton renders it, trimmed to what the parser reads. */
const searchPageOf = (...cards: Card[]) =>
  `<html><body><ul>${cards
    .map(
      ({ slug, title, rating, reviews }) => `
  <li class="search-list__item">
    <a href="/recettes/recette_${slug}.aspx" class="card-content__title">${title}</a>
    ${rating === undefined ? "" : `<div class="rating__rating">${rating}/5</div><div class="rating__nbreviews">${reviews} avis</div>`}
  </li>`,
    )
    .join("")}</ul></body></html>`;

const urlOf = (slug: string) => `https://www.marmiton.org/recettes/recette_${slug}.aspx`;

const scraped = (overrides: Partial<ScrapedRecipe> = {}): ScrapedRecipe => ({
  title: "Tartiflette savoyarde",
  description: "",
  yields: "4 personnes",
  ingredients: [{ name: null, items: [{ value: "1 kg de pommes de terre" }, { value: "1 reblochon" }] }],
  instructions: [{ name: null, items: [{ value: "Cuire les pommes de terre." }] }],
  image: "https://assets.afcdn.com/recipe/tartiflette.jpg",
  ...overrides,
});

const TARTIFLETTE = { fr: "tartiflette", en: "tartiflette" };

/**
 * A cook whose catalog holds nothing, a Marmiton answering `html` (`null` for its 404), every page
 * readable, none imported.
 */
const depsOf = (overrides: Partial<FindWebRecipeDeps> & { html?: string | null } = {}) => {
  const { html = "", ...rest } = overrides;
  return {
    knownByTitle: vi.fn(async () => []),
    fetch: vi.fn(async (): Promise<string | null> => html),
    readPage: vi.fn(async () => scraped()),
    knownBySource: vi.fn(async () => null),
    ...rest,
  } satisfies FindWebRecipeDeps;
};

describe("findWebRecipe › step 0, Cuisko first", () => {
  it("answers a recipe whose title names the dish, and never asks Marmiton", async () => {
    const deps = depsOf({ knownByTitle: vi.fn(async () => [{ id: "recipe_1", title: "La tartiflette" }]) });

    const { result, event } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(result).toEqual({ v: 1, status: "known", recipeId: "recipe_1" });
    expect(event).toEqual({ outcome: "known", knownBy: "title", recipeId: "recipe_1" });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("searches in the cook's language", async () => {
    const deps = depsOf();

    await findWebRecipe({ fr: "hachis parmentier", en: "shepherd's pie" }, "en", deps);

    expect(deps.knownByTitle).toHaveBeenCalledWith("shepherd's pie");
  });

  it("answers none without a request when the French name has no word to search by", async () => {
    const deps = depsOf();

    const { result, event } = await findWebRecipe({ fr: "  ", en: "onion soup" }, "en", deps);

    expect(result).toEqual({ v: 1, status: "none" });
    expect(event).toEqual({ outcome: "none", candidates: 0 });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("asks Marmiton when the search found the dish's words only among ingredients", async () => {
    const deps = depsOf({
      knownByTitle: vi.fn(async () => [
        { id: "recipe_1", title: "Gratin au reblochon" },
        { id: "recipe_2", title: "Poêlée d'oignons" },
      ]),
    });

    await findWebRecipe({ fr: "soupe à l'oignon", en: "onion soup" }, "fr", deps);

    expect(deps.fetch).toHaveBeenCalledWith("https://www.marmiton.org/recettes/recherche.aspx?aqt=soupe%20%C3%A0%20l'oignon");
  });

  it("answers a title that says more than the dish (the accepted limitation, pinned so a change is deliberate)", async () => {
    const deps = depsOf({ knownByTitle: vi.fn(async () => [{ id: "recipe_1", title: "Pizza tartiflette" }]) });

    const { result } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(result).toEqual({ v: 1, status: "known", recipeId: "recipe_1" });
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});

describe("findWebRecipe › Marmiton", () => {
  it("finds the card that names the dish and clears the bar, as a preview without its instructions", async () => {
    const deps = depsOf({ html: searchPageOf({ slug: "tartiflette_1", title: "Tartiflette", rating: 4.6, reviews: 120 }) });

    const { result, event } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(result).toEqual({
      v: 1,
      status: "found",
      recipe: {
        url: urlOf("tartiflette_1"),
        source: "marmiton",
        title: "Tartiflette savoyarde",
        servings: 4,
        ingredients: ["1 kg de pommes de terre", "1 reblochon"],
        imageUrl: "https://assets.afcdn.com/recipe/tartiflette.jpg",
      },
    });
    expect(event).toEqual({ outcome: "found", rating: 4.6, reviews: 120, candidates: 1 });
    expect(deps.readPage).toHaveBeenCalledWith(urlOf("tartiflette_1"));
  });

  it("drops a photo the app could not load, and the card draws its placeholder", async () => {
    const deps = depsOf({
      html: searchPageOf({ slug: "tartiflette_1", title: "Tartiflette", rating: 4.6, reviews: 120 }),
      readPage: vi.fn(async () => scraped({ image: "http://assets.afcdn.com/recipe/tartiflette.jpg" })),
    });

    const { result } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(result?.status === "found" && result.recipe).not.toHaveProperty("imageUrl");
  });

  it("keeps the card's title when the page's is empty", async () => {
    const deps = depsOf({
      html: searchPageOf({ slug: "tartiflette_1", title: "Tartiflette", rating: 4.6, reviews: 120 }),
      readPage: vi.fn(async () => scraped({ title: "" })),
    });

    const { result } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(result).toMatchObject({ status: "found", recipe: { title: "Tartiflette" } });
  });

  it("reads a 404 as Marmiton holding no recipe of the word: none, no throw", async () => {
    const { result, event, error } = await findWebRecipe({ fr: "bakso", en: "bakso" }, "fr", depsOf({ html: null }));

    expect(result).toEqual({ v: 1, status: "none" });
    expect(event).toEqual({ outcome: "none", candidates: 0 });
    expect(error).toBeUndefined();
  });

  it("answers the recipe Cuisko already holds from the chosen page, and never reads the page", async () => {
    const deps = depsOf({
      html: searchPageOf({ slug: "tartiflette_1", title: "Tartiflette", rating: 4.6, reviews: 120 }),
      knownBySource: vi.fn(async () => "recipe_9"),
    });

    const { result, event } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(result).toEqual({ v: 1, status: "known", recipeId: "recipe_9" });
    expect(event).toEqual({ outcome: "known", knownBy: "source", recipeId: "recipe_9", rating: 4.6, reviews: 120, candidates: 1 });
    expect(deps.knownBySource).toHaveBeenCalledWith(urlOf("tartiflette_1"));
    expect(deps.readPage).not.toHaveBeenCalled();
  });

  it("moves to the next card when the winner's page will not read", async () => {
    const deps = depsOf({
      html: searchPageOf(
        { slug: "tartiflette_1", title: "Tartiflette", rating: 4.6, reviews: 900 },
        { slug: "tartiflette_2", title: "Tartiflette facile", rating: 4.4, reviews: 60 },
      ),
      readPage: vi.fn(async (url: string) => {
        if (url === urlOf("tartiflette_1")) throw new ConvexError({ code: "UNREADABLE_PAGE" as const, message: "" });
        return scraped();
      }),
    });

    const { result } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(result).toMatchObject({ status: "found", recipe: { url: urlOf("tartiflette_2") } });
  });

  it("moves on from a page that has ingredients but no steps, which Add would refuse too", async () => {
    const deps = depsOf({
      html: searchPageOf(
        { slug: "tartiflette_1", title: "Tartiflette", rating: 4.6, reviews: 900 },
        { slug: "tartiflette_2", title: "Tartiflette facile", rating: 4.4, reviews: 60 },
      ),
      readPage: vi.fn(async (url: string) => (url === urlOf("tartiflette_1") ? scraped({ instructions: [] }) : scraped())),
    });

    const { result } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(result).toMatchObject({ status: "found", recipe: { url: urlOf("tartiflette_2") } });
  });

  it("reads three pages at most, then answers none", async () => {
    const deps = depsOf({
      html: searchPageOf(
        ...[900, 800, 700, 600, 500].map((reviews, index) => ({
          slug: `tartiflette_${index}`,
          title: "Tartiflette",
          rating: 4.6,
          reviews,
        })),
      ),
      readPage: vi.fn(async () => {
        throw new ConvexError({ code: "UNREADABLE_PAGE" as const, message: "" });
      }),
    });

    const { result, event } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(result).toEqual({ v: 1, status: "none" });
    expect(deps.readPage).toHaveBeenCalledTimes(3);
    expect(event).toMatchObject({ outcome: "none", unreadable: 3 });
  });

  it("answers none when no page that clears the bar will read", async () => {
    const deps = depsOf({
      html: searchPageOf({ slug: "tartiflette_1", title: "Tartiflette", rating: 4.6, reviews: 900 }),
      readPage: vi.fn(async () => {
        throw new ConvexError({ code: "UNREADABLE_PAGE" as const, message: "" });
      }),
    });

    const { result } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(result).toEqual({ v: 1, status: "none" });
  });

  it("reports a recipe page that would not answer as unreachable, not as the next card", async () => {
    const down = new ConvexError({ code: "EXTERNAL_SERVICE_ERROR" as const, message: "The site answered 503" });
    const deps = depsOf({
      html: searchPageOf({ slug: "tartiflette_1", title: "Tartiflette", rating: 4.6, reviews: 900 }),
      readPage: vi.fn(async () => Promise.reject(down)),
    });

    const { event, error } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(event).toEqual({ outcome: "failed", reason: "unreachable" });
    expect(error).toBe(down);
  });
});

describe("findWebRecipe › CHAT_BAR", () => {
  const statusAt = async (rating: number, reviews: number) =>
    (await findWebRecipe(TARTIFLETTE, "fr", depsOf({ html: searchPageOf({ slug: "tartiflette_1", title: "Tartiflette", rating, reviews }) })))
      .result?.status;

  it("passes 5 reviews at 4.0", async () => {
    expect(await statusAt(4.0, 5)).toBe("found");
  });

  it.each([
    [4.0, 4],
    [3.9, 5],
  ])("refuses %s over %s reviews", async (rating, reviews) => {
    expect(await statusAt(rating, reviews)).toBe("none");
  });

  it.each([
    [4.2, 12],
    // The saved pad thaï page's most reviewed recipe, which the catalog script rejected.
    [4.3, 54],
  ])("finds %s over %s reviews, which the catalog's MARMITON_BAR rejects", async (rating, reviews) => {
    expect(passes({ rating, reviews }, MARMITON_BAR)).toBe(false);
    expect(await statusAt(rating, reviews)).toBe("found");
  });
});

describe("findWebRecipe › the event", () => {
  it("names the nearest miss on none: the best card naming the dish, below the bar", async () => {
    const deps = depsOf({
      html: searchPageOf(
        { slug: "tartiflette_1", title: "Tartiflette", rating: 3.8, reviews: 3 },
        { slug: "tartiflette_2", title: "Tartiflette légère", rating: 4.9, reviews: 2 },
        { slug: "gratin_1", title: "Gratin dauphinois", rating: 4.8, reviews: 2000 },
      ),
    });

    const { result, event } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(result).toEqual({ v: 1, status: "none" });
    expect(event).toEqual({
      outcome: "none",
      candidates: 2,
      nearestMiss: { url: urlOf("tartiflette_1"), rating: 3.8, reviews: 3 },
    });
  });

  it("never names a card that cleared the bar as the nearest miss, and counts it as unreadable", async () => {
    const deps = depsOf({
      html: searchPageOf(
        { slug: "tartiflette_1", title: "Tartiflette", rating: 4.6, reviews: 900 },
        { slug: "tartiflette_2", title: "Tartiflette légère", rating: 3.8, reviews: 3 },
      ),
      readPage: vi.fn(async () => {
        throw new ConvexError({ code: "UNREADABLE_PAGE" as const, message: "" });
      }),
    });

    const { event } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(event).toEqual({
      outcome: "none",
      candidates: 2,
      nearestMiss: { url: urlOf("tartiflette_2"), rating: 3.8, reviews: 3 },
      unreadable: 1,
    });
  });

  it("names no nearest miss when no card names the dish", async () => {
    const deps = depsOf({ html: searchPageOf({ slug: "gratin_1", title: "Gratin dauphinois", rating: 4.8, reviews: 2000 }) });

    const { event } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(event).toEqual({ outcome: "none", candidates: 0 });
  });

  it("reports a page the parser cannot read as a parse failure, and returns the error for Error tracking", async () => {
    const deps = depsOf({
      html: `<ul><li class="search-list__item"><a href="/recettes/recette_t_1.aspx" class="card-content__title">Tartiflette</a>
        <div class="rating__rating">★★★★</div><div class="rating__nbreviews">12 avis</div></li></ul>`,
    });

    const { result, event, error } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(result).toBeUndefined();
    expect(event).toEqual({ outcome: "failed", reason: "parse" });
    expect(error).toBeInstanceOf(Error);
  });

  it("reports a search that failed as unreachable", async () => {
    const down = new ConvexError({ code: "EXTERNAL_SERVICE_ERROR" as const, message: "The site answered 503" });
    const deps = depsOf({ fetch: vi.fn(async () => Promise.reject(down)) });

    const { event, error } = await findWebRecipe(TARTIFLETTE, "fr", deps);

    expect(event).toEqual({ outcome: "failed", reason: "unreachable" });
    expect(error).toBe(down);
  });
});
