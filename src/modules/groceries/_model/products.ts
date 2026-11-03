import type { Unit } from "@shared/ingredients";

/**
 * A non-food product as the grid draws it.
 *
 * Not a `StockRow`: that shape answers what a food's tap can move and which plate wants it, and a
 * product has none of those. Tapping one is the end of it.
 */
export type ProductRow = {
  id: string;
  name: string;
  emoji: string;
  amount: number;
  unit: Unit;
  updatedAt: Date;
};

/** Not ordered: `toBuyEntries` lays them out, since where a product sits depends on the sort. */
export const toProductRows = (
  rows: { _id: string; name: string; emoji: string; quantity: number; unit: Unit; updatedAt: number }[],
): ProductRow[] =>
  rows.map((row) => ({
    id: row._id,
    name: row.name,
    emoji: row.emoji,
    amount: row.quantity,
    unit: row.unit,
    updatedAt: new Date(row.updatedAt),
  }));
