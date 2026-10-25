import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { judgeMeasured, MATCHED, NONE, readMatchAnswer } from "@convex/functions/ingredients/matchIngredient";
import { CANDIDATES, ranking, type Scored } from "@convex/lib/typesafe/__tests__/candidates.fixtures";
import { retryPromise } from "@shared/helpers";
import type { Locale } from "@shared/translations";

/**
 * Which result of a source's search page Jev says the shopper's food was measured on, the question
 * `pickMeasuredFood` asks before any figure reaches a row.
 *
 * ⚠️ THIS COSTS MONEY — a fraction of a cent per model: one TypeSafe call per page, for every
 * model in `CANDIDATES` (`lib/typesafe/__tests__/`), which it ranks side by side. Hand-run:
 *
 *     pnpm test:manual
 *
 * It needs a real `OPENROUTER_API_KEY` in `.env.local`; the runner's placeholder is refused below.
 *
 * **The pages are the comparator benchmark, asked of Jev instead of spelling.** `lookupHit.test.ts`
 * holds the same foods as pairs against `aboutTheSameFood`, with the eleven spelling gets wrong;
 * these pages put each of those beside the result that is the food, the way a keyword search
 * returns them. Titles are written the way USDA and Open Food Facts write them, not fetched.
 *
 * **The question is its own, not the catalog's.** Asked `matchIngredient`'s, which calls a broader
 * kind a different item, every model tried on 2026-10-25 refused `egg` its whole egg, and the
 * `broader kind` pages failed on most. `judgeMeasured` asks which result MEASURED the food instead.
 * A page failing here is fixed in that question, not by a lower `MATCHED`.
 */

type Page = {
  title: string;
  text: string;
  locale: Locale;
  results: string[];
  /** The result the food was measured on, or undefined when none of them is it. */
  want?: string;
};

const PAGES: Page[] = [
  // The search ranked the more complete wrong result first; spelling let it through.
  { title: "adds a word", text: "onion", locale: "en", results: ["Onion rings, breaded, par fried, frozen", "Onions, raw", "Onions, dehydrated flakes"], want: "Onions, raw" },
  { title: "adds a word", text: "egg", locale: "en", results: ["Egg, yolk, raw, fresh", "Egg, whole, raw, fresh", "Egg, white, raw, fresh"], want: "Egg, whole, raw, fresh" },
  { title: "adds a word", text: "garlic", locale: "en", results: ["Spices, garlic powder", "Garlic, raw"], want: "Garlic, raw" },
  { title: "adds a word", text: "ail", locale: "fr", results: ["Ail des ours", "Ail"], want: "Ail" },
  { title: "adds a word", text: "potato", locale: "en", results: ["Sweet potato, raw, unprepared", "Potatoes, flesh and skin, raw"], want: "Potatoes, flesh and skin, raw" },
  { title: "adds a word", text: "pesto", locale: "fr", results: ["Pâtes au pesto", "Pesto alla genovese"], want: "Pesto alla genovese" },
  // A preservation word on our side, folded off by the spelling rule.
  { title: "preserved", text: "tomates séchées", locale: "fr", results: ["Tomates", "Tomates séchées à l'huile", "Purée de tomates"], want: "Tomates séchées à l'huile" },
  { title: "preserved", text: "tomates séchées", locale: "fr", results: ["Tomates", "Tomates pelées"] },
  // A word spelling counts as identity, that does not change what was measured.
  { title: "broader kind", text: "huile d'olive vierge extra", locale: "fr", results: ["Huile de tournesol", "Huile d'olive"], want: "Huile d'olive" },
  { title: "broader kind", text: "beurre doux", locale: "fr", results: ["Margarine", "Beurre", "Beurre salé"], want: "Beurre" },
  { title: "broader kind", text: "tomates en conserve", locale: "fr", results: ["Ketchup", "Tomates pelées", "Tomates cerises"], want: "Tomates pelées" },
  // A synonym, which shares no word at all.
  { title: "synonym", text: "green onion", locale: "en", results: ["Onions, raw", "Onions, spring or scallions (includes tops and bulb), raw"], want: "Onions, spring or scallions (includes tops and bulb), raw" },
  // The pesto that started it, and its control.
  { title: "drops a word", text: "red pesto", locale: "en", results: ["Sauce, pesto, CLASSICO, basil pesto, ready-to-serve", "Pesto, red, ready-to-serve"], want: "Pesto, red, ready-to-serve" },
  { title: "drops a word", text: "pesto rouge", locale: "fr", results: ["Pesto alla genovese", "Pesto"] },
  { title: "drops a word", text: "chicken stock", locale: "en", results: ["Soup, stock, beef, home-prepared"] },
  { title: "drops a word", text: "peanut butter", locale: "en", results: ["Peanuts, all types, raw"] },
  { title: "drops a word", text: "beurre salé", locale: "fr", results: ["Beurre doux"] },
  { title: "drops a word", text: "chicken thigh", locale: "en", results: ["Chicken, broilers or fryers, breast, meat only, raw"] },
  { title: "drops a word", text: "rye flour", locale: "en", results: ["Wheat flour, white, all-purpose, enriched"] },
  // The right result is there, beside a sibling sharing a word.
  { title: "sibling", text: "brown rice", locale: "en", results: ["Rice, white, long-grain, regular, raw", "Rice, brown, long-grain, raw"], want: "Rice, brown, long-grain, raw" },
  { title: "sibling", text: "almond milk", locale: "en", results: ["Milk, whole, 3.25% milkfat", "Beverages, almond milk, unsweetened, shelf stable"], want: "Beverages, almond milk, unsweetened, shelf stable" },
  { title: "sibling", text: "crème de marrons", locale: "fr", results: ["Châtaigne, crue", "Crème de marrons"], want: "Crème de marrons" },
  { title: "sibling", text: "lentilles corail", locale: "fr", results: ["Lentilles vertes", "Lentilles corail"], want: "Lentilles corail" },
  { title: "sibling", text: "red wine vinegar", locale: "en", results: ["Alcoholic beverage, wine, table, red", "Vinegar, red wine"], want: "Vinegar, red wine" },
  { title: "sibling", text: "dark chocolate", locale: "en", results: ["Candies, milk chocolate", "Chocolate, dark, 70-85% cacao solids"], want: "Chocolate, dark, 70-85% cacao solids" },
];

const extremes = (values: number[]) =>
  values.length === 0
    ? "none"
    : `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}`;

const runOf = (model: string) =>
  Promise.all(
    PAGES.map(async (page) => {
      const candidates = page.results.map((name, index) => ({ id: String(index), name }));
      // Retried as production retries: every model runs at once, and a free tier's 429 is not a wrong answer.
      const answer = await retryPromise(
        () => judgeMeasured({ text: page.text, locale: page.locale, candidates, dictionary: {}, model }),
        2,
      );
      const kept = readMatchAnswer(answer, candidates)?.name;
      const wrong = Math.max(
        0,
        ...Object.entries(answer.probabilities)
          .filter(([option]) => option !== NONE && option !== page.want)
          .map(([, probability]) => probability),
      );

      return { page, answer, kept, wrong, probability: answer.probabilities[answer.choice] ?? 0 };
    }),
  );
type Row = Awaited<ReturnType<typeof runOf>>[number];

/** Filled by each model's test as it lands, ranked once they all have. */
const scores: Scored[] = [];

describe("pickMeasuredFood's question against the real models", () => {
  beforeAll(() => {
    expect(
      process.env.OPENROUTER_API_KEY,
      "no real OPENROUTER_API_KEY — put one in .env.local",
    ).not.toMatch(/^test-/);
  });

  afterAll(() => {
    console.log(`\npickMeasuredFood, ${PAGES.length} pages, by pages right then gap:\n${ranking(scores)}`);
  });

  // Sanity on the pages themselves: a `want` the model never saw is a typo here.
  test("every page wants one of its own results", () => {
    for (const page of PAGES) if (page.want) expect(page.results).toContain(page.want);
  });

  // One test per model, so the run says which models pass and the ranking says by how much.
  test.concurrent.each(CANDIDATES)("%s keeps the figures of the food, and of nothing else", async (model) => {
    let rows: Row[];
    try {
      rows = await runOf(model);
    } catch (error) {
      const failed = error instanceof Error ? error.message : String(error);
      scores.push({ model, failed, right: 0, total: PAGES.length, rightLinks: [], wrong: [], misses: [] });
      throw error;
    }

    scores.push({
      model,
      right: rows.filter((r) => r.kept === r.page.want).length,
      total: PAGES.length,
      rightLinks: rows.filter((r) => r.page.want && r.answer.choice === r.page.want).map((r) => r.probability),
      wrong: rows.map((r) => r.wrong),
      misses: rows.filter((r) => r.kept !== r.page.want).map((r) => `${r.page.text} → ${r.kept ?? NONE}`),
    });

    console.log(
      `\n${model}:\n` +
      rows
        .map(({ page, answer, kept, wrong, probability }) =>
          `${kept === page.want ? "✓" : "✗"} ${page.title.padEnd(13)} ${page.text.padEnd(27)} ` +
          `want ${(page.want ?? NONE).slice(0, 30).padEnd(30)} ` +
          `pick ${answer.choice.slice(0, 30).padEnd(30)} p ${probability.toFixed(2)} worst wrong ${wrong.toFixed(2)}`,
        )
        .join("\n"),
    );

    const right = rows.filter((r) => r.page.want && r.answer.choice === r.page.want);
    console.log(
      `\npick probability on the ${right.length} right: ${extremes(right.map((r) => r.probability))}` +
      `\nmost any wrong result drew, per page: ${extremes(rows.map((r) => r.wrong))}` +
      `\nMATCHED is ${MATCHED}. ${rows.filter((r) => r.kept === r.page.want).length} / ${rows.length} pages right.`,
    );

    expect(rows.filter((r) => r.kept !== r.page.want).map((r) => `${r.page.text} → ${r.kept ?? NONE}`)).toEqual([]);
  });
});
