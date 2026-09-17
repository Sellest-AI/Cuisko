import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { fromStockUnit, stockUnitOf, type Unit } from "@shared/ingredients";
import { MEAL_SLOTS } from "@shared/mealSlots";

import { cascadeDelete } from "../cascade";
import { addToGroceryList } from "../cellars/addToGroceryList";
import type { Need, Stock } from "./selectMeals";

/** What a line's ingredient has to say about itself: how it converts, and how it is bought. */
export type LineIngredient = Pick<
  Doc<"ingredients">,
  "_id" | "defaultUnit" | "defaultQuantity" | "gramsPerPiece" | "gramsPerMl"
>;

/** One line of a meal: the need, the catalog row behind it, and whether the shopper says they have it. */
export type MealLine = {
  need: Need;
  ingredient: LineIngredient;
  /**
   * The shopper has said this is already in the kitchen, so nothing is bought for it.
   *
   * Their answer, not the cellar's: the cellar is `stock`, and it decides coverage. This only ever
   * suppresses the grocery write — the line still reserves what it reserves, because it still gets
   * cooked.
   */
  owned: boolean;
};

type Args = {
  householdId: Id<"households">;
  plannedMealId: Id<"plannedMeals">;
  lines: MealLine[];
  /**
   * What the cellar can still give, in each ingredient's stock unit — **consumed in place**, so the
   * next meal is scored against what this one left. The caller owns it, and it must not already
   * count this meal's own existing lines: `availableStock` subtracts every planned meal's ledger,
   * this meal's included, so a re-scale names the meal as `except` and its reservations stay out.
   */
  stock: Stock;
  /** The lot each ingredient is reserved against — a hint for a later "what expires first", not an authority. */
  lots: Map<Id<"ingredients">, Id<"cellarItems">>;
  /**
   * Local-day timestamp: the first day a plate still counts as ahead of the household. A jar this
   * meal's old lines put on the list is handed to a later plate that needs it, and "later" is read
   * from here — the same line `availableStock` draws for what still reserves stock.
   */
  from: number;
};

/** Under this, a remainder is float noise from a conversion rather than something to buy. */
const NOTHING_LEFT = 1e-9;

/**
 * The (ingredient, unit) pair a shopper's "already in the kitchen" tick is keyed by — the recipe's
 * own unit, not the stock unit, because the tick answers for the line as the recipe wrote it.
 * Shared because the tick is written by one caller and read back by another, and a second spelling
 * of the key would agree only until one of them changed.
 */
export const ownedTickKey = (ingredientId: Id<"ingredients">, unit: Unit) => `${ingredientId}:${unit}`;

/** What one line reserves, what is missing from it, and the unit each is counted in. */
type Split = {
  quantity: number;
  unit: Unit;
  /** Whether the kitchen covers the whole line — a pinch by its presence, anything else by amount. */
  covered: boolean;
  /** The part no cellar row covers, in `unit`. Zero for a pinch, which is never part-covered. */
  missing: number;
  /** Whether the line actually took something off the shelf, which is what makes a lot worth naming. */
  reservedStock: boolean;
};

/**
 * A line against the stock it draws on, taking what it uses.
 *
 * Three kinds, three rules, and the unit differs between them — see `Need`. A pinch asks whether the
 * ingredient is there at all and takes nothing, so it reserves `0` and is either covered or bought
 * whole. An unmeasured line cannot reach the stock unit, so it is counted in the recipe's own words
 * and is never covered.
 */
const _split = (need: Need, ingredient: LineIngredient, stock: Stock): Split => {
  const unit = stockUnitOf(ingredient.defaultUnit);

  switch (need.kind) {
    case "pinch":
      return { quantity: 0, unit, covered: stock.has(need.ingredientId), missing: 0, reservedStock: false };

    case "unmeasured":
      return { quantity: need.quantity, unit: need.unit, covered: false, missing: need.quantity, reservedStock: false };

    case "measured": {
      const left = Math.max(0, stock.get(need.ingredientId) ?? 0);
      const used = Math.min(left, need.amount);

      if (used > 0) stock.set(need.ingredientId, left - used);

      const short = need.amount - used;

      return {
        quantity: need.amount,
        unit,
        covered: short <= NOTHING_LEFT,
        missing: short > NOTHING_LEFT ? short : 0,
        reservedStock: used > 0,
      };
    }
  }
};

/**
 * What to buy for a line, in the unit the household shops in — or nothing.
 *
 * A pinch is bought at the ingredient's own `defaultQuantity`: you buy a jar of thyme, not the 1 tsp
 * of it the recipe asks for. An unmeasured line is bought in the recipe's words, because that is the
 * only unit it has. Everything else converts out of the stock unit, where `pcs` rounds up.
 */
const _toBuy = ({ need, ingredient }: MealLine, split: Split): { quantity: number; unit: Unit } | null => {
  if (split.covered) return null;

  if (need.kind === "pinch") return { quantity: ingredient.defaultQuantity, unit: ingredient.defaultUnit };
  if (need.kind === "unmeasured") return { quantity: need.quantity, unit: need.unit };

  return { quantity: fromStockUnit(split.missing, ingredient), unit: ingredient.defaultUnit };
};

/**
 * Takes a ledger row's contribution back off the grocery list.
 *
 * Against the row it went onto rather than against the ingredient, because the write it undoes was
 * lossy — it merged with other meals, and it rounded — and `groceryQuantity` is the only record of
 * what actually landed.
 *
 * A row that has since been bought or struck off is simply gone, and there is nothing to give back
 * — both gestures detach the claim's pointer as they take the row, so the `get` below reads `null`
 * only on data from before that, and the guard is what keeps the invariant survivable rather than
 * load-bearing. The same care at the bottom: a row taken at zero goes through the cascade too, so
 * a merged row's other claims lose their pointer with it instead of naming a ghost.
 *
 * Never below zero: the row may hold less than this line put on it, because somebody edited it.
 */
const _backOut = async (ctx: MutationCtx, row: Doc<"plannedMealIngredients">) => {
  if (!row.groceryListItemId || !row.groceryQuantity) return;

  const item = await ctx.db.get(row.groceryListItemId);
  if (!item) return;

  const left = item.quantity - row.groceryQuantity;

  if (left > NOTHING_LEFT) await ctx.db.patch(item._id, { quantity: left, updatedAt: Date.now() });
  else await cascadeDelete(ctx, "groceryListItems", item._id);
};

/** The household's plates still ahead of it, other than this one, in the order the week is eaten. */
const _laterPlates = async (ctx: MutationCtx, householdId: Id<"households">, plannedMealId: Id<"plannedMeals">, from: number) => {
  const plates = await ctx.db
    .query("plannedMeals")
    .withIndex("by_household_and_date", (q) => q.eq("householdId", householdId).gte("date", from))
    .collect();

  return plates
    .filter((plate) => plate.status === "planned" && plate._id !== plannedMealId)
    .sort((a, b) => a.date - b.date || MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot));
};

/**
 * The first later plate's line that is living off this row's jar, if any.
 *
 * A jar is bought once for the week — see the pinch note in `syncMealLines` — so every plate after
 * the one that asked for it records its pinch as covered with nothing to buy: `quantity` 0, no
 * `groceryQuantity`, not ticked by the shopper. Giving the jar back with this row would leave that
 * plate reading ready with its pinch bought by nobody, so the claim is handed on instead. A jar
 * already bought has no row to hand on; the pointer was detached when it went.
 */
const _heirOf = async (
  ctx: MutationCtx,
  row: Doc<"plannedMealIngredients">,
  plates: () => Promise<Doc<"plannedMeals">[]>,
) => {
  if (row.quantity !== 0 || !row.groceryQuantity || !row.groceryListItemId) return undefined;
  if (!(await ctx.db.get(row.groceryListItemId))) return undefined;

  for (const plate of await plates()) {
    const lines = await ctx.db
      .query("plannedMealIngredients")
      .withIndex("by_planned_meal", (q) => q.eq("plannedMealId", plate._id))
      .collect();

    const heir = lines.find(
      (line) => line.ingredientId === row.ingredientId && line.quantity === 0 && !line.groceryQuantity && !line.owned,
    );

    if (heir) return heir;
  }

  return undefined;
};

/**
 * Makes a planned meal's ledger equal `lines`, and moves the grocery list by the difference.
 *
 * **The only writer of `plannedMealIngredients`**, and the only place the grocery list learns what a
 * plan needs. Committing a week calls it once per plate; re-scaling or dropping a plate will call it
 * with new lines or with none, and the list follows either way — which is why it replaces rather
 * than appends, and why every row it deletes gives its `groceryQuantity` back first.
 *
 * The lines are walked in order and `stock` is consumed as they go, so a recipe naming an ingredient
 * twice is scored against what its first line left behind.
 */
export const syncMealLines = async (ctx: MutationCtx, { householdId, plannedMealId, lines, stock, lots, from }: Args) => {
  const existing = await ctx.db
    .query("plannedMealIngredients")
    .withIndex("by_planned_meal", (q) => q.eq("plannedMealId", plannedMealId))
    .collect();

  /** Read once, and only if a jar has to find an heir — a fresh plate has nothing to back out. */
  let later: Promise<Doc<"plannedMeals">[]> | undefined;
  const laterPlates = () => (later ??= _laterPlates(ctx, householdId, plannedMealId, from));

  for (const row of existing) {
    const heir = await _heirOf(ctx, row, laterPlates);

    if (heir) {
      await ctx.db.patch(heir._id, {
        groceryQuantity: row.groceryQuantity,
        groceryListItemId: row.groceryListItemId,
        updatedAt: Date.now(),
      });
      // The jar stays on the list, so a plate rewritten below still finds the ingredient present.
      if (!stock.has(row.ingredientId)) stock.set(row.ingredientId, 0);
    } else {
      await _backOut(ctx, row);
    }

    await ctx.db.delete(row._id);
  }

  for (const line of lines) {
    const split = _split(line.need, line.ingredient, stock);
    const buying = line.owned ? null : _toBuy(line, split);

    /**
     * A pinch bought once is a pinch the kitchen has, for every plate after it.
     *
     * Presence is the whole of a pinch's arithmetic, so the jar that lands on the list has to make
     * the ingredient present — otherwise each plate asking for thyme finds none and buys another
     * jar, and a week of three such plates orders three. Recorded at `0`: it is a jar nothing has
     * measured, which is exactly what a `Stock` key with nothing behind it means.
     */
    if (line.need.kind === "pinch" && !stock.has(line.need.ingredientId)) {
      stock.set(line.need.ingredientId, 0);
    }

    /**
     * Recorded as what LANDED, not as what was asked for: the list may already hold this
     * ingredient in another unit of the same family, in which case the write merged into that row
     * and `contribution` is this line's share in that row's unit — the unit `_backOut` will
     * subtract in. `buying.quantity` is in `defaultUnit` and would be the wrong number there.
     */
    const landed = buying
      ? await addToGroceryList(ctx, {
        householdId,
        ingredientId: line.need.ingredientId,
        quantity: buying.quantity,
        unit: buying.unit,
      })
      : undefined;

    await ctx.db.insert("plannedMealIngredients", {
      plannedMealId,
      ingredientId: line.need.ingredientId,
      sourceQuantity: line.need.quantity,
      sourceUnit: line.need.unit,
      quantity: split.quantity,
      unit: split.unit,
      groceryQuantity: landed?.contribution,
      groceryListItemId: landed?.id,
      cellarItemId: split.reservedStock ? lots.get(line.need.ingredientId) : undefined,
      owned: line.owned,
      updatedAt: Date.now(),
    });
  }
};
