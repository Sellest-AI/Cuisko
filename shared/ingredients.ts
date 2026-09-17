/**
 * Where a row's facts came from, and how much to trust them.
 *
 * Not a synonym for `slug`. The seed sets a slug and nothing else does, which distinguishes two
 * cases when there are four — and the four are not equally trustworthy about `nutrition`, which
 * this table requires and every screen draws a Nutri-Score from. `foodComposition` is a
 * measurement somebody made; `agent` is a generation. Recording which lets a later screen say so,
 * and lets us find and re-derive every invented row once a better lookup exists.
 *
 * `foodComposition` covers every measured composition table — CIQUAL and USDA FoodData Central
 * both — because what a later reader needs to know is that a laboratory measured it, not which
 * laboratory. `openFoodFacts` is separate because it is packaged products declared by their
 * manufacturer, which is a weaker claim about a raw ingredient.
 *
 * Ordered from most to least trustworthy, deliberately — the resolver tries them in this order.
 */
export const INGREDIENT_SOURCES = ["seed", "foodComposition", "openFoodFacts", "agent"] as const;

export type IngredientSource = (typeof INGREDIENT_SOURCES)[number];

/**
 * The unit vocabulary, and how to write one down.
 *
 * Shared rather than owned by a module because two of them need it and neither may reach into the
 * other's private `_model/` (lint R8): groceries formats what the cellar holds, planning formats
 * what a week's meals add up to, and a second copy of the labels is how the two drift apart.
 */

export const UNITS = ["pcs", "kg", "g", "mg", "cl", "ml", "l", "tbsp", "tsp", "oz", "lb"] as const;

export type Unit = (typeof UNITS)[number];

/**
 * What a cook may TYPE for a unit that is not its stored code — the French spoons, for now.
 *
 * Stored codes are English (`tbsp`, `tsp`); input accepts a per-language spelling and normalises
 * it on the way in. The two spoons used to be stored as `cs` and `cc`, and a French cook goes on
 * writing them into the search bar, so dropping the aliases with the literals would reject a word
 * the app itself taught them. This is the whole reason `normalizeUnit` returns a code rather than
 * answering yes or no — see CONVENTIONS.md §3.3.
 *
 * ⚠️ A `Map`, not an object literal, and that is not a style choice. Every caller of
 *    `normalizeUnit` hands it a string a person typed or a deep link carried, and an object
 *    lookup answers for `Object.prototype` too — `aliases["constructor"]` is a FUNCTION, which is
 *    truthy, so a sheet opened on `?unit=constructor` reached `STEPS[unit].filter(…)` on
 *    `undefined` and crashed. A `Map` has no such keys to reach.
 */
const UNIT_ALIASES = new Map<string, Unit>([
  ["cs", "tbsp"],
  ["cc", "tsp"],
]);

/** Every spelling `normalizeUnit` accepts, for a caller that has to build a pattern out of them. */
export const UNIT_INPUTS: readonly string[] = [...UNITS, ...UNIT_ALIASES.keys()];

/**
 * The canonical code for whatever was typed, or `undefined` when it is not a unit at all.
 *
 * Case-insensitive on purpose: "500 KG" is a shopper writing in a hurry, not a different unit.
 * The navigation bar parses free text and the quantity sheet validates it — they have to agree,
 * or a quantity that parses in one is rejected by the other.
 *
 * ⚠️ A normaliser rather than the type guard this used to be, and the difference is load-bearing.
 *    A guard narrows the caller's OWN string and hands it back, so a guard that says yes to "cs"
 *    writes "cs" into the grocery flow — where `vUnit` no longer holds that literal and rejects it
 *    at the mutation. The shopper types a word the bar accepted and the save fails. Callers must
 *    use the RETURNED value, never the input.
 */
export const normalizeUnit = (value: string | undefined): Unit | undefined => {
  if (value === undefined) return undefined;

  const lower = value.toLowerCase();

  return UNITS.find((unit) => unit === lower) ?? UNIT_ALIASES.get(lower);
};

/**
 * Drawn for a tile that has no catalog row behind it to take a glyph from — a ghost line the
 * shopper has typed while the lookup is still running.
 *
 * It used to stand in for a row written before `emoji` existed as well; the column is required
 * now, so every catalog row carries its own and that second job is gone. Still shared rather than
 * inlined at the one caller, because the grid and the search bar draw the same list and must not
 * disagree about what an unresolved line looks like.
 */
export const NO_EMOJI = "\u{1F37D}\u{FE0F}";

const UNIT_LABELS: Record<Unit, string> = {
  g: "g",
  mg: "mg",
  kg: "kg",
  lb: "lb",
  oz: "oz",
  cl: "cl",
  ml: "ml",
  l: "L",
  pcs: "pcs",
  tbsp: "tbsp",
  tsp: "tsp",
};

/**
 * The stored code, spelled for a screen — `l` as `L`, and everything else as itself.
 *
 * Not a translation, and not the one the UI should reach for. The codes are English, so a French
 * cook reading `2 tbsp` is reading a word from the wrong language; `Vocabulary.Units` in the
 * locale files holds the one they expect, and `formatQuantity` takes a resolver so the module
 * layer can supply it. This stays as the fallback for text nobody localises.
 */
export const unitLabel = (unit: Unit) => UNIT_LABELS[unit];

/**
 * An amount and its unit, for a person READING a recipe. Lossy on purpose.
 *
 * Placeholder formatting. Real copy normalises per ingredient — "4 yaourts", not "500 g of
 * yoghurt" — which needs the ingredient to carry its own preferred unit, and that is not
 * modelled yet. A fractional amount keeps one decimal so a halved recipe does not read `0.5000000001`.
 *
 * ⚠️ Never use this for text that will be read back and re-parsed — `exactQuantity` is that one.
 *    Both the rounding and `unitLabel` (which spells `l` as `L`) are display decisions, and a round
 *    trip through them turns a stored `0.25` into `0.3` permanently.
 *
 * `label` is how the word gets localised without `shared/` ever importing `translations`: the
 * module layer passes a resolver built from `t("Vocabulary.Units.<code>")` (`useUnitLabel`), and
 * this file goes on knowing only the stored codes. The default is the English code itself, which
 * is right for a caller with no locale to hand and wrong for anything a cook reads — a screen left
 * on it renders `2 tbsp` to a French cook, silently.
 */
export const formatQuantity = (
  amount: number,
  unit: Unit,
  label: (unit: Unit) => string = unitLabel,
) => `${Number.isInteger(amount) ? amount : amount.toFixed(1)} ${label(unit)}`;

/**
 * The same pair, for text a MACHINE will read back — the editor's textarea, and the comparison that
 * decides whether an edit touched the ingredients at all.
 *
 * Deliberately not `formatQuantity` with a flag. The two differ in both halves — the amount is
 * rounded there and exact here, the unit is a label there and its stored code here — so a shared
 * function would be two branches wearing one name, and the call site would still have to know which
 * it wanted. Two names is the point: reusing the display formatter for data is the mistake this
 * split exists to make visible, and it is the mistake `serializeIngredients` originally made.
 */
export const exactQuantity = (amount: number, unit: Unit) => `${amount} ${unit}`;

/**
 * A quantity is a NUMBER AND ITS UNIT, and the two are answered together or not at all.
 *
 * The bar reads what the shopper typed and the row knows its own default, and filling the two
 * halves independently mixes them: "2 gnocchis" parses to an amount with no unit, and taking the
 * row's unit for the blank half turns two packets into two GRAMS — the row's default quantity was
 * 500 of them. The shopper is billed for a quarter of a gnocchi and nothing on screen looks wrong.
 *
 * So a half-typed quantity is not half-honoured. Both halves come from the shopper when they gave
 * both, and from the row otherwise. In practice the bar's parser emits them as a pair and the mixed
 * case should not arise — this is what makes sure it cannot, rather than trusting that it does not.
 */
export const pickQuantity = (
  typed: { amount: number | null | undefined; unit: Unit | null | undefined },
  fallback: { defaultQuantity: number; defaultUnit: Unit },
): { amount: number; unit: Unit } =>
  typed.amount != null && typed.unit != null
    ? { amount: typed.amount, unit: typed.unit }
    : { amount: fallback.defaultQuantity, unit: fallback.defaultUnit };

/**
 * What a catalog ingredient knows about its own weight — the two optional fields on the
 * `ingredients` table, passed structurally so this file never has to reach for a `Doc`.
 */
export type GramWeights = {
  /** Grams in one of them: 150 for an onion. */
  gramsPerPiece?: number;
  /** Density, in grams per millilitre: 0.91 for oil, 1.42 for honey. */
  gramsPerMl?: number;
};

/** Grams in one of each mass unit. The only conversions that need nothing from the ingredient. */
const GRAMS_PER_MASS_UNIT = {
  g: 1,
  mg: 0.001,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
} as const satisfies Partial<Record<Unit, number>>;

/**
 * Millilitres in one of each volume unit.
 *
 * `tbsp` and `tsp` are 15 and 5 ml — the metric spoon a French cook calls a cuillère à soupe or à
 * café, not the US tablespoon/teaspoon, which are 14.79 and 4.93. The difference is under a
 * percent of a spoonful and nothing here would notice, but the number has to come from somewhere,
 * and the codes being English does not make the kitchen they are measured in American.
 */
const ML_PER_VOLUME_UNIT = {
  ml: 1,
  cl: 10,
  l: 1000,
  tbsp: 15,
  tsp: 5,
} as const satisfies Partial<Record<Unit, number>>;

/**
 * A quantity in grams, or `undefined` when this ingredient does not know what it weighs.
 *
 * Every nutrition fact in the catalog is per 100g, so this is the gate every recipe line passes
 * through before it can be counted. Returning `undefined` rather than guessing is the point: a
 * caller that substituted 1 g/ml for a missing density would understate honey by 40% and report it
 * with the same confidence as a line measured in grams.
 *
 * Units are matched by table rather than by falling through to `pcs`, so a unit added to `UNITS`
 * and to neither table returns `undefined` instead of being silently weighed as a piece.
 */
export const toGrams = (quantity: number, unit: Unit, weights: GramWeights): number | undefined => {
  if (unit in GRAMS_PER_MASS_UNIT) {
    return quantity * GRAMS_PER_MASS_UNIT[unit as keyof typeof GRAMS_PER_MASS_UNIT];
  }

  if (unit in ML_PER_VOLUME_UNIT) {
    if (weights.gramsPerMl === undefined) return undefined;
    return quantity * ML_PER_VOLUME_UNIT[unit as keyof typeof ML_PER_VOLUME_UNIT] * weights.gramsPerMl;
  }

  if (unit === "pcs") {
    if (weights.gramsPerPiece === undefined) return undefined;
    return quantity * weights.gramsPerPiece;
  }

  return undefined;
};

/** The unit an ingredient's stock is counted in, for each kind of unit it may be bought in. */
const STOCK_UNITS = { mass: "g", volume: "ml", piece: "pcs" } as const;

export type StockUnit = (typeof STOCK_UNITS)[keyof typeof STOCK_UNITS];

const _dimensionOf = (unit: Unit): keyof typeof STOCK_UNITS =>
  unit in GRAMS_PER_MASS_UNIT ? "mass" : unit in ML_PER_VOLUME_UNIT ? "volume" : "piece";

/**
 * The one unit every quantity of this ingredient is compared in: grams for flour, millilitres for
 * milk, pieces for eggs — whichever kind of unit it is bought in.
 *
 * Not grams for everything, because grams need data the catalog does not always hold. Six carrots
 * in the cellar against three in a recipe is a subtraction, and routing it through a missing
 * `gramsPerPiece` turned it into "nothing is covered".
 */
export const stockUnitOf = (defaultUnit: Unit): StockUnit => STOCK_UNITS[_dimensionOf(defaultUnit)];

/**
 * A quantity in its ingredient's stock unit, or `undefined` when it cannot get there.
 *
 * Within one kind of unit this is arithmetic and needs nothing from the ingredient: 1 l of milk is
 * 1000 ml, 2 kg of flour 2000 g. Across kinds it goes through grams, and needs the ratios both ends
 * speak — 1 tbsp of butter bought in grams needs a density, 300 g of carrots bought by the piece
 * needs a piece weight. Missing either is `undefined`, never a guess, for the reason `toGrams` is.
 */
export const toStockUnit = (
  quantity: number,
  unit: Unit,
  ingredient: GramWeights & { defaultUnit: Unit },
): number | undefined => {
  const target = _dimensionOf(ingredient.defaultUnit);
  const source = _dimensionOf(unit);

  if (source === target) {
    if (source === "mass") return quantity * GRAMS_PER_MASS_UNIT[unit as keyof typeof GRAMS_PER_MASS_UNIT];
    if (source === "volume") return quantity * ML_PER_VOLUME_UNIT[unit as keyof typeof ML_PER_VOLUME_UNIT];
    return quantity;
  }

  const grams = toGrams(quantity, unit, ingredient);
  if (grams === undefined) return undefined;
  if (target === "mass") return grams;

  const perUnit = target === "volume" ? ingredient.gramsPerMl : ingredient.gramsPerPiece;
  return perUnit === undefined ? undefined : grams / perUnit;
};

/**
 * A recipe's stored ingredients, back into the free-text lines the editor's textarea holds.
 *
 * The inverse of what `sanitizeRecipe` does to a cook's own text on the way in, and therefore
 * `exactQuantity` rather than `formatQuantity`: this string is data on its way to being re-read, not
 * copy on its way to being looked at. It seeds the editor AND is one side of `recipeChangesOf`'s
 * comparison, so rounding here would mean a cook who edits the title of a recipe holding `0.25 tsp`
 * hands back `0.3 tsp` and loses the quarter permanently, with nothing on screen to suggest it.
 *
 * Both sides of that comparison call this same function, so the editor and the change check can
 * never disagree about how a line spells itself.
 */
type DraftIngredient = { name: string; quantity: number; unit: Unit };
export const serializeIngredients = (ingredients: DraftIngredient[]): string =>
  ingredients.map((line) => `${exactQuantity(line.quantity, line.unit)} ${line.name}`).join("\n");

/**
 * A quantity of an ingredient's stock unit, back in the unit it is SHOPPED in.
 *
 * The inverse of `toStockUnit` within one kind of unit, which is the only direction shopping needs:
 * the stock unit is derived from `defaultUnit` (`stockUnitOf`), so the two always share a dimension
 * and no ratio is involved — 347 g of an ingredient bought in kg is 0.347 kg.
 *
 * Pieces round **up** to a whole, and that is not a display choice: the number this returns is what
 * goes on the grocery list and what gets taken back off it, and no shop sells 0.4 of an onion.
 */
export const fromStockUnit = (amount: number, ingredient: { defaultUnit: Unit }): number => {
  const unit = ingredient.defaultUnit;

  if (unit in GRAMS_PER_MASS_UNIT) return amount / GRAMS_PER_MASS_UNIT[unit as keyof typeof GRAMS_PER_MASS_UNIT];
  if (unit in ML_PER_VOLUME_UNIT) return amount / ML_PER_VOLUME_UNIT[unit as keyof typeof ML_PER_VOLUME_UNIT];

  return Math.ceil(amount);
};

/** The families grocery list rows merge within — see `mergeGroupOf`. */
export type MergeGroup = "mass" | "volume";

/**
 * The family a grocery list row may merge within, or `null` for a unit that never merges.
 *
 * Mass: kg · g · mg · oz · lb, ordered by grams. Volume: l · ml · cl, ordered by millilitres.
 * `pcs` is out because pieces have no reliable conversion — the rule `toStockUnit` lives by.
 * `tbsp` and `tsp` are out by product decision: spoons are cooking measures, not shopping units, and
 * planning never writes them to the list, so there is nothing for them to merge with today.
 *
 * This is the policy; `convertQuantity` is the maths, and it will happily convert a spoon to
 * millilitres — which is why callers gate on this before converting.
 */
export const mergeGroupOf = (unit: Unit): MergeGroup | null => {
  if (unit in GRAMS_PER_MASS_UNIT) return "mass";
  if (unit === "ml" || unit === "cl" || unit === "l") return "volume";

  return null;
};

/**
 * Where a unit sits on its family's ladder — grams for mass, millilitres for volume — or
 * `undefined` for `pcs`. Two units of the same family compare by this, and the bigger one is the
 * unit a merged row is written in.
 */
export const unitScale = (unit: Unit): number | undefined => {
  if (unit in GRAMS_PER_MASS_UNIT) return GRAMS_PER_MASS_UNIT[unit as keyof typeof GRAMS_PER_MASS_UNIT];
  if (unit in ML_PER_VOLUME_UNIT) return ML_PER_VOLUME_UNIT[unit as keyof typeof ML_PER_VOLUME_UNIT];

  return undefined;
};

/**
 * A quantity rewritten in another unit of the same dimension, or `undefined` when the two units
 * differ in dimension or either is `pcs`.
 *
 * Pure ratio, no ingredient data: 1 kg is 1000 g whatever it is a kilogram of. Crossing dimensions
 * needs a density or a piece weight, and that is `toStockUnit`'s job, not this one's.
 */
export const convertQuantity = (quantity: number, from: Unit, to: Unit): number | undefined => {
  if (_dimensionOf(from) !== _dimensionOf(to)) return undefined;

  const fromScale = unitScale(from);
  const toScale = unitScale(to);
  if (fromScale === undefined || toScale === undefined) return undefined;

  return (quantity * fromScale) / toScale;
};
