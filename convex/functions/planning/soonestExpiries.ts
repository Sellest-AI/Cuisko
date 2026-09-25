import type { Doc, Id } from "@convex/_generated/dataModel";

/**
 * The soonest date any held lot of an ingredient goes off — the one that decides what to cook first.
 *
 * Lots at 0 and undated lots are skipped, so an ingredient with no key here is not urgent. Pure, so
 * the caller decides which lots to read; both callers read the household's whole cellar.
 *
 * ⚠️ Taken over every lot, including one a planned meal will drain first (`consumeFromCellar`'s
 * `_drainOrder`), so the date can belong to stock the plan has set aside. The exact answer drains
 * reservations through that same order.
 */
export const soonestExpiries = (lots: readonly Doc<"cellarItems">[]): Map<Id<"ingredients">, number> => {
  const expiries = new Map<Id<"ingredients">, number>();

  for (const lot of lots) {
    if (lot.quantity <= 0 || lot.expirationDate === undefined) continue;
    expiries.set(lot.ingredientId, Math.min(expiries.get(lot.ingredientId) ?? Infinity, lot.expirationDate));
  }

  return expiries;
};
