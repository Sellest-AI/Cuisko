import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { DEFAULT_SERVINGS } from "@shared/recipes";

import { type ScrapedRecipe, toRecipeDraft } from "../toRecipeDraft";

import enPublisher from "./fixtures/en-publisher.json";
import frBlog from "./fixtures/fr-blog.json";
import grouped from "./fixtures/grouped.json";
import sparse from "./fixtures/sparse.json";

/**
 * `en-publisher` and `fr-blog` are REAL scrapes, captured from bbcgoodfood.com and marmiton.org by
 * running the same per-field extraction `importOneNode` runs. They are checked in rather than
 * fetched so this file needs no network and cannot go red because a publisher redesigned a page.
 *
 * `grouped` and `sparse` are hand-written, because the two shapes they carry are the ones this
 * function actually has to decide something about — named groups, and a page that answers half the
 * questions — and no real page reliably holds still on either.
 */
const as = (fixture: unknown) => fixture as ScrapedRecipe;

describe("toRecipeDraft", () => {
  describe("a real English publisher page", () => {
    const draft = toRecipeDraft(as(enPublisher));

    it("carries the title and the servings the page stated", () => {
      expect(draft.title).toBe("Easy classic lasagne");
      expect(draft.servings).toBe(6);
    });

    it("keeps every ingredient line, one per line", () => {
      expect(draft.ingredients.split("\n")).toHaveLength(15);
      expect(draft.ingredients.split("\n")[0]).toBe("1 tbsp olive oil");
    });

    it("keeps every instruction step", () => {
      expect(draft.instructions.split("\n").filter(Boolean)).toHaveLength(5);
      expect(draft.instructions).toContain("Heat the oil in a large saucepan");
    });
  });

  describe("a real French page", () => {
    const draft = toRecipeDraft(as(frBlog));

    it("survives the accents intact", () => {
      expect(draft.title).toContain("Beignets d’oignons");
      expect(draft.ingredients).toContain("aubergine coupées en demi-lune");
    });

    it("keeps every line of both halves", () => {
      expect(draft.ingredients.split("\n")).toHaveLength(17);
      expect(draft.instructions.split("\n").filter(Boolean)).toHaveLength(15);
    });
  });

  describe("a page whose lines are grouped", () => {
    const draft = toRecipeDraft(as(grouped));

    /**
     * The asymmetry the function exists to apply. An ingredients heading written into the field
     * would be read back as a food and resolved against the catalog; an instructions heading has a
     * form that survives a re-parse, so it is kept.
     */
    it("drops the ingredient group names, since that field has no heading form", () => {
      expect(draft.ingredients.split("\n")).toHaveLength(6);
      expect(draft.ingredients).not.toContain("Pour la sauce");
      expect(draft.ingredients).not.toContain("Pour la béchamel");
    });

    it("keeps the instruction group names, since that field does", () => {
      expect(draft.instructions).toContain("La sauce");
      expect(draft.instructions).toContain("Le montage");
    });

    it("reads a servings count out of a yield written as a sentence", () => {
      expect(draft.servings).toBe(8);
    });
  });

  describe("a page that answers only half of it", () => {
    const draft = toRecipeDraft(as(sparse));

    it("falls back to the default when the yield holds no number", () => {
      expect(draft.servings).toBe(DEFAULT_SERVINGS);
    });

    it("seeds an empty title rather than undefined, because a form field cannot hold one", () => {
      expect(draft.title).toBe("");
      expect(draft.description).toBe("");
    });

    it("trims the lines and drops the blank ones", () => {
      expect(draft.ingredients.split("\n")).toEqual(["2 onions", "a knob of butter"]);
    });

    /**
     * The `- ` is `serializeInstructions`' own step marker, which is what the editor's instructions
     * field is written in — the same text an existing recipe seeds that field with.
     */
    it("drops a group left with no steps in it", () => {
      expect(draft.instructions.split("\n").filter(Boolean)).toEqual([
        "- Sweat the onions in the butter until soft.",
      ]);
    });
  });

  describe("a yield that is not a servings count", () => {
    const withYield = (yields: string) => toRecipeDraft({ ...as(grouped), yields }).servings;

    it("takes a plain number", () => {
      expect(withYield("4 servings")).toBe(4);
    });

    it("refuses a count too large to be servings, rather than believing it", () => {
      expect(withYield("Makes 240 cookies")).toBe(DEFAULT_SERVINGS);
    });

    it("refuses zero, which says nothing", () => {
      expect(withYield("0 servings")).toBe(DEFAULT_SERVINGS);
    });
  });

  /**
   * Per the plan's §1 this is an expected ending rather than a defect: the cook is told the page
   * could not be read and handed the paste form, which is truthful in a way a blank editor is not.
   */
  describe("a page with no recipe on it", () => {
    const throws = (scraped: Partial<ScrapedRecipe>) => () =>
      toRecipeDraft({ ...as(grouped), ...scraped });

    const expectUnreadable = (run: () => unknown) => {
      expect(run).toThrow(ConvexError);
      try {
        run();
      } catch (caught) {
        expect((caught as ConvexError<{ code: string }>).data.code).toBe("UNREADABLE_PAGE");
      }
    };

    it("refuses one with no ingredients", () => {
      expectUnreadable(throws({ ingredients: [] }));
    });

    it("refuses one with no instructions", () => {
      expectUnreadable(throws({ instructions: [] }));
    });

    it("refuses one whose only lines are blank, which a title alone does not rescue", () => {
      expectUnreadable(throws({ ingredients: [{ name: null, items: [{ value: "   " }] }] }));
    });
  });
});
