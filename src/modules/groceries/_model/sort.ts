/**
 * The three ways "To Buy" can be read, and the grouping each one implies.
 *
 * A sort is a way of reading the list, not a fact about the household: nothing here is stored,
 * and every group is a view over the rows `buildSections` already produced. Only the to-buy
 * section is grouped — the cellar and "recently bought" keep their order whatever is chosen.
 *
 * No React and no Jotai here, same as `model.ts`; `atoms.ts` holds the chosen sort.
 */

import { CATEGORIES, type Category } from "@shared/categories";
import { MEAL_SLOTS, type MealSlot } from "@shared/mealSlots";

import { matchesRef, type Plate, type Snapshot, type StockRow } from "./model";

export const SORTS = ["standard", "by-category", "by-plan"] as const;
export type Sort = (typeof SORTS)[number];

export const isSort = (value: string): value is Sort => SORTS.some((sort) => sort === value);

/**
 * What a group is headed by. `null` is the plain list, which has the section heading and nothing
 * under it. The other three are sub-headings the grid draws inside "To Buy".
 */
export type ToBuyHeading =
  | null
  | { kind: "plate"; recipeId: string; title: string; date: Date; slot: MealSlot }
  | { kind: "category"; category: Category }
  | { kind: "unplanned" };

export type ToBuyGroup = {
  /** Stable across re-renders, so a sub-heading keeps its mounted instance while its rows move. */
  id: string;
  heading: ToBuyHeading;
  rows: StockRow[];
};

/**
 * Under this, what is left of a row after the plates took their shares is float noise from a
 * conversion, not something the shopper typed. Same threshold as the server's `NOTHING_LEFT`.
 */
const NOTHING_LEFT = 1e-9;

/** Soonest first: by day, then by the order the day's slots are eaten in. */
const _byCookTime = (a: Plate, b: Plate) =>
  a.date.getTime() - b.date.getTime() || MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot);

/**
 * The rows split per plate, each plate with its own share.
 *
 * A list row is one merged number — 300 g of parmesan — and the shopper doing Monday's groceries
 * wants to know that Monday's lasagna is 200 g of it. So the row is drawn under every plate that
 * claims it, with that plate's claim as its amount, and whatever is left after the plates have
 * taken theirs — what the shopper typed themselves — closes the list under "unplanned".
 *
 * **Drained soonest-first, against the row's amount.** The plates' claims can add up to more than
 * the row still asks for, because the cellar may already cover part of it; that cover comes off
 * the earliest plate first, which is the plate that will be cooked first and will take the stock
 * first — the same FIFO the server settles claims in. A plate whose share is drained to nothing
 * is not drawn at all.
 *
 * **Keys.** The first copy of a row keeps the row's own id, so the card the shopper was looking
 * at flies to the soonest plate; every later copy is scoped to its plate, and enters and leaves
 * as the leftover row of a part-bought ingredient already does. Same two-key rule as
 * `buildSections`, for the same reason.
 */
const _byPlan = (rows: StockRow[], snapshot: Snapshot): ToBuyGroup[] => {
  const plates = [...snapshot.plates].sort(_byCookTime);
  const shares = new Map<string, StockRow[]>(plates.map((plate) => [plate.id, []]));
  const unplanned: StockRow[] = [];

  for (const row of rows) {
    const lineIds = new Set(snapshot.lines.filter(matchesRef(row)).map((line) => line.id));
    let remaining = row.amount;
    let first = true;

    for (const plate of plates) {
      const claimed = plate.claims
        .filter((claim) => lineIds.has(claim.lineId))
        .reduce((total, claim) => total + claim.amount, 0);
      const share = Math.min(claimed, remaining);
      if (share <= NOTHING_LEFT) continue;

      shares.get(plate.id)!.push({ ...row, id: first ? row.id : `plate:${plate.id}:${row.id}`, amount: share });
      remaining -= share;
      first = false;
    }

    if (remaining > NOTHING_LEFT) unplanned.push({ ...row, id: first ? row.id : `unplanned:${row.id}`, amount: remaining });
  }

  return [
    ...plates.map((plate): ToBuyGroup => ({
      id: `plate:${plate.id}`,
      heading: { kind: "plate", recipeId: plate.recipeId, title: plate.title, date: plate.date, slot: plate.slot },
      rows: shares.get(plate.id)!,
    })),
    { id: "unplanned", heading: { kind: "unplanned" } as const, rows: unplanned },
  ].filter((group) => group.rows.length > 0);
};

/**
 * The rows by aisle, in the catalog's aisle order.
 *
 * No folding of a lone row into "Other", unlike the recipe page: on a list, a heading with one
 * card under it is still the aisle the shopper has to walk to.
 */
const _byCategory = (rows: StockRow[], snapshot: Snapshot): ToBuyGroup[] => {
  const categoryOf = (row: StockRow): Category =>
    snapshot.ingredients.find(({ id }) => id === row.ingredientId)?.category ?? "OTHER";

  return CATEGORIES.map((category): ToBuyGroup => ({
    id: `category:${category}`,
    heading: { kind: "category", category },
    rows: rows.filter((row) => categoryOf(row) === category),
  })).filter((group) => group.rows.length > 0);
};

/**
 * The to-buy rows, grouped the way the shopper asked to read them.
 *
 * Rows arrive in section order — recency, then name — and keep it inside each group; a sort
 * chooses the headings, never the order under them. An empty list is no groups at all, in every
 * sort, so the grid draws nothing rather than a heading over nothing.
 */
export const groupToBuy = (rows: StockRow[], sort: Sort, snapshot: Snapshot): ToBuyGroup[] => {
  if (sort === "by-plan") return _byPlan(rows, snapshot);
  if (sort === "by-category") return _byCategory(rows, snapshot);

  return rows.length > 0 ? [{ id: "to-buy", heading: null, rows }] : [];
};
