import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rejectionCodeOf } from "../../__tests__/convexError.fixtures";

import { readRecipePage } from "../readRecipePage";

/**
 * The network and the Node-only scraper, replaced wholesale, so `recipe-scrapers` and `cheerio`
 * never load into this edge runtime (as `importOne.test.ts` does it). What is under test is the
 * wording between them.
 */
const fetchPage = vi.hoisted(() => vi.fn());
const scrapePage = vi.hoisted(() => vi.fn());

vi.mock("../fetchPage", () => ({ fetchPage }));
vi.mock("../scrapePage", () => ({ scrapePage }));

const PAGE = "https://www.marmiton.org/recettes/recette_tartiflette_11111.aspx";

beforeEach(() => {
  fetchPage.mockReset();
  fetchPage.mockResolvedValue("<html></html>");
  scrapePage.mockReset();
});

describe("readRecipePage", () => {
  it("scrapes the page it fetched, at that address", async () => {
    const scraped = { title: "Tartiflette", description: "", yields: "4", ingredients: [], instructions: [] };
    scrapePage.mockResolvedValue(scraped);

    expect(await readRecipePage(PAGE)).toBe(scraped);
    expect(fetchPage).toHaveBeenCalledWith(PAGE);
    expect(scrapePage).toHaveBeenCalledWith("<html></html>", PAGE);
  });

  it("words a scraper that came apart on the markup as an unreadable page, never its stack", async () => {
    scrapePage.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'text')"));

    expect(await rejectionCodeOf(readRecipePage(PAGE))).toBe("UNREADABLE_PAGE");
  });

  it("passes a ConvexError through as it was", async () => {
    scrapePage.mockRejectedValue(new ConvexError({ code: "NOT_FOUND" as const, message: "gone" }));

    expect(await rejectionCodeOf(readRecipePage(PAGE))).toBe("NOT_FOUND");
  });

  it("passes the fetch's own failure through, so the site not answering is not worded as no recipe", async () => {
    fetchPage.mockRejectedValue(new ConvexError({ code: "EXTERNAL_SERVICE_ERROR" as const, message: "503" }));

    expect(await rejectionCodeOf(readRecipePage(PAGE))).toBe("EXTERNAL_SERVICE_ERROR");
    expect(scrapePage).not.toHaveBeenCalled();
  });
});
