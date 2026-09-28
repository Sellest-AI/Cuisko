import type { Unit } from "@shared/ingredients";

/**
 * The onboarding's pretend kitchen: a to-buy list and a cellar that exist for the length of the
 * flow and are never written anywhere.
 *
 * Deliberately not the groceries module's model. That one reconciles a household's real stock,
 * with units it converts and a plan it nets against; this one only has to make three hints land,
 * move and be cooked in the order the screens ask, and a line shared with the real model would
 * make the demo answerable to every rule the real one grows. Only the unit vocabulary is shared, so
 * a card formats its quantity the way a real one does.
 */

export type PantryRow = { ingredient: string; quantity: number; unit: Unit };

export type Pantry = { toBuy: PantryRow[]; cellar: PantryRow[] };

/** What cooking took out of the cellar, and whether the row went with it. */
type Deduction = PantryRow & { isGone: boolean };

export const EMPTY_PANTRY: Pantry = { toBuy: [], cellar: [] };

const _isSame = (a: PantryRow, b: PantryRow) => a.ingredient === b.ingredient && a.unit === b.unit;

/** Adds `row` to `rows`, summing into a row of the same ingredient and unit if there is one. */
const _merge = (rows: PantryRow[], row: PantryRow): PantryRow[] =>
  rows.some((existing) => _isSame(existing, row))
    ? rows.map((existing) =>
        _isSame(existing, row) ? { ...existing, quantity: existing.quantity + row.quantity } : existing,
      )
    : [...rows, row];

/** Something to buy: lands on the to-buy list, as the real bar's `relist` mode does. */
export const add = (pantry: Pantry, row: PantryRow): Pantry => ({
  ...pantry,
  toBuy: _merge(pantry.toBuy, row),
});

/** Bought: the to-buy row moves into the cellar whole. An ingredient not on the list is a no-op. */
export const buy = (pantry: Pantry, ingredient: string): Pantry => {
  const bought = pantry.toBuy.filter((row) => row.ingredient === ingredient);

  if (bought.length === 0) return pantry;

  return {
    toBuy: pantry.toBuy.filter((row) => row.ingredient !== ingredient),
    cellar: bought.reduce(_merge, pantry.cellar),
  };
};

/**
 * Cooked: each line takes what it can from the cellar, never more than is there, and a row brought
 * to nothing leaves it.
 *
 * A line the cellar does not hold is skipped rather than reported: it was on the grocery list, and
 * the demo stops before the shop. Only what actually left comes back as a deduction, which is what
 * the cook screen shows.
 */
export const cook = (pantry: Pantry, lines: PantryRow[]): { pantry: Pantry; deductions: Deduction[] } => {
  const deductions: Deduction[] = [];

  const cellar = lines.reduce((rows, line) => {
    const held = rows.find((row) => _isSame(row, line));

    if (!held) return rows;

    const taken = Math.min(held.quantity, line.quantity);
    const left = held.quantity - taken;

    deductions.push({ ...held, quantity: taken, isGone: left === 0 });

    return left === 0
      ? rows.filter((row) => row !== held)
      : rows.map((row) => (row === held ? { ...row, quantity: left } : row));
  }, pantry.cellar);

  return { pantry: { ...pantry, cellar }, deductions };
};

/** The lines of a recipe the cellar cannot cover in full: what planning it puts on the list. */
export const missingFrom = (cellar: PantryRow[], lines: PantryRow[]): PantryRow[] =>
  lines.flatMap((line) => {
    const held = cellar.find((row) => _isSame(row, line))?.quantity ?? 0;

    return held >= line.quantity ? [] : [{ ...line, quantity: line.quantity - held }];
  });
