import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "../../../_generated/api";
import type { FindWebRecipeOutcome } from "../../../functions/webRecipes/findWebRecipe";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * The search itself, replaced: it reaches `cheerio` and `recipe-scrapers`, and its steps, bar and
 * event are proven against saved pages in `functions/webRecipes/__tests__/`. What is left here is the
 * wiring: who the event is filed under, and what a failure sends Error tracking before it throws.
 */
const findWebRecipe = vi.hoisted(() => vi.fn<() => Promise<FindWebRecipeOutcome>>());
const capture = vi.hoisted(() => vi.fn());
const captureException = vi.hoisted(() => vi.fn());

vi.mock("@convex/functions/webRecipes/findWebRecipe", () => ({ findWebRecipe }));
vi.mock("@convex/lib/scraping/fetchPage", () => ({ fetchPage: vi.fn() }));
vi.mock("@convex/lib/scraping/readRecipePage", () => ({ readRecipePage: vi.fn() }));
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture, captureException } }));

const TARTIFLETTE = { dish: { fr: "tartiflette", en: "tartiflette" }, locale: "fr" as const };

let t: ReturnType<typeof convexTest>;

beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(
        ([path]) =>
          path.startsWith("/convex/router/recipes/findWebRecipe.") ||
          path.startsWith("/convex/router/recipes/search.") ||
          path.startsWith("/convex/router/recipes/findBySource."),
      )
      .map(([, load]) => load()),
  ),
);

beforeEach(() => {
  t = convexTest(schema, modules);
  findWebRecipe.mockReset();
  capture.mockReset();
  captureException.mockReset();
});

const seedCook = () => t.run((ctx) => ctx.db.insert("users", { name: "Camille" }));

describe("router/recipes/findWebRecipe", () => {
  test("reports the search under the cook, and sends Error tracking nothing", async () => {
    const userId = await seedCook();
    const event = { outcome: "none", candidates: 2, nearestMissUrl: "https://www.marmiton.org/recettes/recette_tartiflette_1.aspx", nearestMissRating: 3.8, nearestMissReviews: 3 } as const;
    findWebRecipe.mockResolvedValue({ result: { v: 1, status: "none" }, event });

    const found = await t.action(internal.router.recipes.findWebRecipe._internal, { ...TARTIFLETTE, userId });

    expect(found).toEqual({ v: 1, status: "none" });
    expect(capture.mock.calls.map(([, args]) => args)).toEqual([
      { distinctId: userId, event: "web recipe searched", properties: event },
    ]);
    expect(captureException).not.toHaveBeenCalled();
  });

  /** Marmiton redesigned its search page: one issue in Error tracking, and the model gives the old answer. */
  test("a failed search is reported, sent to Error tracking with its cause, then thrown", async () => {
    const userId = await seedCook();
    const error = new Error("A Marmiton search card has a rating block this parser cannot read. The markup has probably changed.");
    findWebRecipe.mockResolvedValue({ event: { outcome: "failed", reason: "parse" }, error });

    await expect(t.action(internal.router.recipes.findWebRecipe._internal, { ...TARTIFLETTE, userId })).rejects.toThrow(
      /EXTERNAL_SERVICE_ERROR/,
    );

    expect(capture.mock.calls.map(([, args]) => args)).toEqual([
      { distinctId: userId, event: "web recipe searched", properties: { outcome: "failed", reason: "parse" } },
    ]);
    expect(captureException.mock.calls.map(([, args]) => args)).toEqual([
      { error, distinctId: userId, additionalProperties: { source: "marmiton", reason: "parse", feature: "web recipe search" } },
    ]);
  });

  /** What varied between two outages rides in the cause, so the issue's list can be filtered by it. */
  test("an unreachable recipe page reaches Error tracking with the page and what the site answered", async () => {
    const userId = await seedCook();
    const error = Object.assign(new Error("A Marmiton recipe page did not answer"), {
      cause: { url: "https://www.marmiton.org/recettes/recette_tartiflette_1.aspx", detail: "The site answered 503" },
    });
    findWebRecipe.mockResolvedValue({ event: { outcome: "failed", reason: "unreachable" }, error });

    await expect(t.action(internal.router.recipes.findWebRecipe._internal, { ...TARTIFLETTE, userId })).rejects.toThrow(
      /EXTERNAL_SERVICE_ERROR/,
    );

    expect(captureException.mock.calls[0]![1].additionalProperties).toEqual({
      url: "https://www.marmiton.org/recettes/recette_tartiflette_1.aspx",
      detail: "The site answered 503",
      source: "marmiton",
      reason: "unreachable",
      feature: "web recipe search",
    });
  });
});
