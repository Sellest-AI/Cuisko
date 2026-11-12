import { describe, expect, test } from "vitest";

import { stockIntentOf } from "../stockIntent";

/**
 * Where a food typed into the bar lands: the cellar ("buy" — it is now owned) or the list
 * ("relist" — it is to buy). The shopper says it twice over, by the "+" they pressed and by the page
 * they are on, and the button is the more deliberate of the two.
 */
describe("stockIntentOf", () => {
  test.each([
    ["the cellar +", "cellar", undefined, "buy"],
    ["the list +", "shopping-list", undefined, "relist"],
    ["the cellar + over the list section", "cellar", "to-buy", "buy"],
    ["the list + over the cellar section", "shopping-list", "cellar", "relist"],
    ["the cellar section, no +", "default", "cellar", "buy"],
    ["the list section, no +", "default", "to-buy", "relist"],
    ["the recently bought section, no +", "default", "recently-bought", "relist"],
    ["anywhere else", "default", undefined, "relist"],
  ] as const)("%s", (_, mode, openSection, expected) => {
    expect(stockIntentOf({ mode, openSection })).toBe(expected);
  });

  /**
   * The page was opened with a destination of its own — the cellar after a dish is cooked, where a
   * food typed next is one the cook just used up and wants to buy again.
   */
  test.each([
    ["the cooked cellar page", "default", "cellar", "list", "relist"],
    ["an addTo cellar over the list section", "default", "to-buy", "cellar", "buy"],
    ["the cellar + over addTo list", "cellar", "cellar", "list", "buy"],
    ["the list + over addTo cellar", "shopping-list", "to-buy", "cellar", "relist"],
  ] as const)("%s", (_, mode, openSection, addTo, expected) => {
    expect(stockIntentOf({ mode, openSection, addTo })).toBe(expected);
  });
});
