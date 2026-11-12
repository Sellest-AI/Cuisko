import type { useGroceriesPage } from "~/modules/groceries/hooks";

import type { AssistantMode } from "../_hooks/useNavigationBar";

/**
 * The three facts the decision reads. One named object rather than three positions: two of them
 * are often missing, and `stockIntentOf("default", undefined, "list")` cannot be read at a glance.
 */
type StockFacts = { mode: AssistantMode } & Partial<
  Pick<ReturnType<typeof useGroceriesPage>, "openSection" | "addTo">
>;

/**
 * What a food typed into the bar does to stock: "buy" puts it in the cellar, "relist" puts it on
 * the list.
 *
 * Three things can say where it goes, and the order is the contract:
 *
 * 1. **A home "+".** Pressing one is the shopper saying where the food goes, in so many words. It
 *    counts for one add — the bar clears the mode once the food is in (`showGroceries`).
 * 2. **The page's `addTo`**, set by whoever opened it. The cellar after a dish is cooked carries
 *    "list": what a cook types next is a food they just used up and want to buy again.
 * 3. **The section the page leads with.** A shopper who opened their cellar is telling us what they
 *    own. Every other place means they are writing something down to buy.
 *
 * Named because two submissions need it — an ingredient the catalog already holds, and one the
 * resolver had to go and find. They must agree, or the same word typed twice lands in two
 * different places depending on whether we happened to know it.
 *
 * The return type is inferred rather than imported: `Intent` lives in the groceries module's
 * `_model/`, which is its interior (lint R8), and the literal union is what `apply` accepts.
 */
export const stockIntentOf = ({ mode, openSection, addTo }: StockFacts) => {
  if (mode === "cellar") return "buy" as const;
  if (mode === "shopping-list") return "relist" as const;

  const goesToCellar = addTo !== undefined ? addTo === "cellar" : openSection === "cellar";

  return goesToCellar ? ("buy" as const) : ("relist" as const);
};
