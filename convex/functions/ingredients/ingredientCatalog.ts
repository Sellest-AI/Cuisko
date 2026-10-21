import type { Category } from "@shared/categories";
import type { Unit } from "@shared/ingredients";
import { sortAllergens, type Allergen } from "@shared/allergens";
import type { Diet } from "@shared/diets";
import { SUPPORTED_LOCALES, type Locale } from "@shared/translations";

/**
 * The starter ingredient catalog `seedIngredients.ts` writes to the database.
 *
 * Values are per 100g/100ml, compiled by hand from public nutrition references (USDA FoodData
 * Central and CIQUAL) rather than fetched live — there is no single free API that returns clean
 * generic-ingredient nutrition AND a matching French name, so a live fetch would still need this
 * much curation on top. `defaultUnit`/`defaultQuantity` are a starting point for "how much of this
 * does a household usually buy at once", not a measured fact — edit freely.
 *
 * Where neither reference measures a food, its row says what it read instead, in a comment beside
 * it: the median of the product labels on Open Food Facts for a jarred sauce or a loaf, another
 * national table (India's, for curry leaves), one named label, or a blend worked out from other rows
 * of this file. A row with no comment is a USDA or CIQUAL entry read as it stands.
 *
 * **Every figure is per 100 g of the RAW, EDIBLE part**, and a reference that lists a food several
 * times (raw, boiled, roasted) is read at its raw entry. Raw means uncooked, not fresh: a food sold
 * dry (nori sheets, a stock cube, a spice) is read as the shop sells it. A recipe line is a raw
 * weight, and cooking drives out water, not calories, so a cooked figure times a raw weight counts
 * the same energy again: `mussels` took USDA's "cooked, moist heat" entry, 172 kcal against 86 raw,
 * and every dish of them came out at twice its calories. The edible part is the other half of that
 * rule: bone and shell are in the weights below and out of these figures, and `EDIBLE_SHARE`
 * reconciles the two.
 *
 * One row per tuple keeps a few hundred entries reviewable; `CATALOG` below is what the rest of the
 * code actually consumes.
 */
type Row = readonly [
  slug: string,
  en: string,
  fr: string,
  category: Category,
  unit: Unit,
  quantity: number,
  calories: number,
  protein: number,
  fat: number,
  saturatedFat: number,
  carbohydrates: number,
  sugars: number,
  fiber: number,
  sodium: number,
];

export type CatalogEntry = {
  slug: string;
  en: string;
  fr: string;
  emoji: string;
  aliases: Partial<Record<Locale, string[]>>;
  category: Category;
  /**
   * Absent when neither the category nor `DIET` could answer. `seedIngredients` throws on it
   * rather than writing the row — see `DIET_BY_CATEGORY`.
   */
  diet?: Diet;
  allergens: Allergen[];
  defaultUnit: Unit;
  defaultQuantity: number;
  gramsPerPiece?: number;
  gramsPerSlice?: number;
  gramsPerMl?: number;
  /** Absent for the whole of it. See `EDIBLE_SHARE`. */
  edibleShare?: number;
  /** Optional in the type only: the catalog test fails on a row `SHELF_LIFE_DAYS` misses. */
  shelfLifeDays?: number;
  openedShelfLifeDays?: number;
  nutrition: {
    calories: number;
    protein: number;
    fat: number;
    saturatedFat: number;
    carbohydrates: number;
    sugars: number;
    fiber: number;
    sodium: number;
  };
};

// prettier-ignore
const ROWS: Row[] = [
  // ── Vegetables ──────────────────────────────────────────────────────────────────────────
  ["onion", "Onion", "Oignon", "VEGETABLE", "pcs", 1, 40, 1.1, 0.1, 0, 9.3, 4.2, 1.7, 4],
  ["carrot", "Carrot", "Carotte", "VEGETABLE", "g", 200, 41, 0.9, 0.2, 0, 10, 4.7, 2.8, 69],
  ["potato", "Potato", "Pomme de terre", "VEGETABLE", "g", 500, 77, 2, 0.1, 0, 17, 0.8, 2.2, 6],
  ["sweet-potato", "Sweet potato", "Patate douce", "VEGETABLE", "g", 300, 86, 1.6, 0.1, 0, 20, 4.2, 3, 55],
  ["garlic", "Garlic", "Ail", "VEGETABLE", "pcs", 1, 149, 6.4, 0.5, 0.1, 33, 1, 2.1, 17],
  ["tomato", "Tomato", "Tomate", "VEGETABLE", "pcs", 1, 18, 0.9, 0.2, 0, 3.9, 2.6, 1.2, 5],
  ["cucumber", "Cucumber", "Concombre", "VEGETABLE", "pcs", 1, 15, 0.7, 0.1, 0, 3.6, 1.7, 0.5, 2],
  ["bell-pepper-red", "Red bell pepper", "Poivron rouge", "VEGETABLE", "pcs", 1, 31, 1, 0.3, 0, 6, 4.2, 2.1, 4],
  ["zucchini", "Zucchini", "Courgette", "VEGETABLE", "pcs", 1, 17, 1.2, 0.3, 0.1, 3.1, 2.5, 1, 8],
  ["eggplant", "Eggplant", "Aubergine", "VEGETABLE", "pcs", 1, 25, 1, 0.2, 0, 6, 3.5, 3, 2],
  ["broccoli", "Broccoli", "Brocoli", "VEGETABLE", "g", 300, 34, 2.8, 0.4, 0.1, 7, 1.7, 2.6, 33],
  ["cauliflower", "Cauliflower", "Chou-fleur", "VEGETABLE", "g", 500, 25, 1.9, 0.3, 0.1, 5, 1.9, 2, 30],
  ["spinach", "Spinach", "Épinard", "VEGETABLE", "g", 150, 23, 2.9, 0.4, 0.1, 3.6, 0.4, 2.2, 79],
  ["lettuce-romaine", "Romaine lettuce", "Laitue romaine", "VEGETABLE", "pcs", 1, 17, 1.2, 0.3, 0, 3.3, 1.2, 2.1, 8],
  ["cabbage", "Cabbage", "Chou blanc", "VEGETABLE", "pcs", 1, 25, 1.3, 0.1, 0, 5.8, 3.2, 2.5, 18],
  ["red-cabbage", "Red cabbage", "Chou rouge", "VEGETABLE", "pcs", 1, 31, 1.4, 0.2, 0, 7.4, 3.8, 2.1, 27],
  ["kale", "Kale", "Chou kale", "VEGETABLE", "g", 150, 49, 4.3, 0.9, 0.1, 9, 2.3, 3.6, 38],
  ["celery", "Celery", "Céleri branche", "VEGETABLE", "g", 200, 16, 0.7, 0.2, 0, 3, 1.8, 1.6, 80],
  ["leek", "Leek", "Poireau", "VEGETABLE", "pcs", 1, 61, 1.5, 0.3, 0, 14, 3.9, 1.8, 20],
  ["mushroom", "Mushroom", "Champignon de Paris", "VEGETABLE", "g", 250, 22, 3.1, 0.3, 0, 3.3, 2, 1, 5],
  ["pumpkin", "Pumpkin", "Potiron", "VEGETABLE", "g", 500, 26, 1, 0.1, 0.1, 6.5, 2.8, 0.5, 1],
  ["butternut-squash", "Butternut squash", "Courge butternut", "VEGETABLE", "g", 500, 45, 1, 0.1, 0, 12, 2.2, 2, 4],
  ["green-beans", "Green beans", "Haricots verts", "VEGETABLE", "g", 200, 31, 1.8, 0.2, 0, 7, 3.3, 3.4, 6],
  ["peas", "Peas", "Petits pois", "VEGETABLE", "g", 200, 81, 5.4, 0.4, 0.1, 14, 5.7, 5.7, 5],
  ["asparagus", "Asparagus", "Asperge", "VEGETABLE", "g", 200, 20, 2.2, 0.1, 0, 3.9, 1.9, 2.1, 2],
  ["brussels-sprouts", "Brussels sprouts", "Choux de Bruxelles", "VEGETABLE", "g", 200, 43, 3.4, 0.3, 0.1, 9, 2.2, 3.8, 25],
  ["beet", "Beet", "Betterave", "VEGETABLE", "pcs", 1, 43, 1.6, 0.2, 0, 10, 7, 2.8, 78],
  ["radish", "Radish", "Radis", "VEGETABLE", "g", 150, 16, 0.7, 0.1, 0, 3.4, 1.9, 1.6, 39],
  ["turnip", "Turnip", "Navet", "VEGETABLE", "pcs", 1, 28, 0.9, 0.1, 0, 6.4, 3.8, 1.8, 67],
  ["fennel", "Fennel", "Fenouil", "VEGETABLE", "pcs", 1, 31, 1.2, 0.2, 0, 7.3, 3.9, 3.1, 52],
  ["corn-sweet", "Sweet corn", "Maïs doux", "VEGETABLE", "g", 200, 86, 3.3, 1.4, 0.2, 19, 6.3, 2.7, 15],
  ["artichoke", "Artichoke", "Artichaut", "VEGETABLE", "pcs", 1, 47, 3.3, 0.2, 0, 10.5, 1, 5.4, 94],
  ["chard", "Swiss chard", "Blette", "VEGETABLE", "g", 200, 19, 1.8, 0.2, 0, 3.7, 1.1, 1.6, 213],
  ["endive", "Endive", "Endive", "VEGETABLE", "pcs", 1, 17, 1.3, 0.2, 0, 3.4, 0.3, 3.1, 22],
  ["shallot", "Shallot", "Échalote", "VEGETABLE", "pcs", 1, 72, 2.5, 0.1, 0, 16.8, 7.9, 3.2, 12],
  ["bell-pepper-green", "Green bell pepper", "Poivron vert", "VEGETABLE", "pcs", 1, 20, 0.9, 0.2, 0.1, 4.6, 2.4, 1.7, 3],
  ["cherry-tomato", "Cherry tomato", "Tomate cerise", "VEGETABLE", "g", 250, 18, 0.9, 0.2, 0, 3.9, 2.6, 1.2, 5],
  ["spring-onion", "Spring onion", "Oignon vert", "VEGETABLE", "pcs", 6, 32, 1.8, 0.2, 0, 7.3, 2.3, 2.6, 16],
  ["chili-green", "Green chilli", "Piment vert", "VEGETABLE", "pcs", 4, 40, 2, 0.2, 0, 9.5, 5.1, 1.5, 7],
  ["onion-red", "Red onion", "Oignon rouge", "VEGETABLE", "pcs", 3, 40, 1.1, 0.1, 0, 9.3, 4.2, 1.7, 4],
  ["bell-pepper-yellow", "Yellow bell pepper", "Poivron jaune", "VEGETABLE", "pcs", 1, 27, 1, 0.2, 0, 6.3, 2.4, 0.9, 2],
  ["arugula", "Arugula", "Roquette", "VEGETABLE", "g", 125, 25, 2.6, 0.7, 0.1, 3.7, 2.1, 1.6, 27],
  ["lambs-lettuce", "Lamb's lettuce", "Mâche", "VEGETABLE", "g", 125, 21, 2, 0.4, 0, 3.6, 0.8, 1.8, 4],
  ["celeriac", "Celeriac", "Céleri-rave", "VEGETABLE", "pcs", 1, 42, 1.5, 0.3, 0.1, 9.2, 1.6, 1.8, 100],
  ["ginger-fresh", "Fresh ginger", "Gingembre frais", "VEGETABLE", "g", 100, 80, 1.8, 0.8, 0.2, 18, 1.7, 2, 13],
  ["jalapeno", "Jalapeño", "Piment jalapeño", "VEGETABLE", "pcs", 4, 29, 0.9, 0.4, 0, 6.5, 4.1, 2.8, 3],
  ["bean-sprouts", "Bean sprouts", "Germes de soja", "VEGETABLE", "g", 200, 30, 3, 0.2, 0, 5.9, 4.1, 1.8, 6],
  ["bok-choy", "Bok choy", "Pak choï", "VEGETABLE", "pcs", 2, 13, 1.5, 0.2, 0, 2.2, 1.2, 1, 65],
  ["chili-red", "Red chilli", "Piment rouge", "VEGETABLE", "pcs", 4, 40, 1.9, 0.4, 0, 8.8, 5.3, 1.5, 9],
  // USDA measures no bird's eye or scotch bonnet apart: both carry its hot red chilli, 170106.
  ["chili-birds-eye", "Bird's eye chilli", "Piment oiseau", "VEGETABLE", "pcs", 10, 40, 1.9, 0.4, 0, 8.8, 5.3, 1.5, 9],
  ["scotch-bonnet", "Scotch bonnet pepper", "Piment scotch bonnet", "VEGETABLE", "pcs", 4, 40, 1.9, 0.4, 0, 8.8, 5.3, 1.5, 9],
  ["chinese-cabbage", "Chinese cabbage", "Chou chinois", "VEGETABLE", "pcs", 1, 16, 1.2, 0.2, 0, 3.2, 1.4, 1.2, 9],
  ["chestnut-mushroom", "Chestnut mushroom", "Champignon brun", "VEGETABLE", "g", 250, 22, 2.5, 0.1, 0, 4.3, 1.7, 0.6, 6],
  ["watercress", "Watercress", "Cresson", "VEGETABLE", "pcs", 1, 11, 2.3, 0.1, 0, 1.3, 0.2, 0.5, 41],
  ["snow-peas", "Snow peas", "Pois gourmands", "VEGETABLE", "g", 200, 42, 2.8, 0.2, 0, 7.6, 4, 2.6, 4],
  // CIQUAL 20031, laitue. It measures no sucrine apart, and the leaves are the same.
  ["little-gem", "Little gem lettuce", "Sucrine", "VEGETABLE", "pcs", 2, 15, 1.3, 0.2, 0, 2.5, 0.7, 1.2, 9],

  // ── Fruits ──────────────────────────────────────────────────────────────────────────────
  ["apple", "Apple", "Pomme", "FRUIT", "pcs", 1, 52, 0.3, 0.2, 0, 14, 10.4, 2.4, 1],
  ["banana", "Banana", "Banane", "FRUIT", "pcs", 1, 89, 1.1, 0.3, 0.1, 23, 12, 2.6, 1],
  ["orange", "Orange", "Orange", "FRUIT", "pcs", 1, 47, 0.9, 0.1, 0, 12, 9.4, 2.4, 0],
  ["lemon", "Lemon", "Citron", "FRUIT", "pcs", 1, 29, 1.1, 0.3, 0, 9.3, 2.5, 2.8, 2],
  ["lime", "Lime", "Citron vert", "FRUIT", "pcs", 1, 30, 0.7, 0.2, 0, 11, 1.7, 2.8, 2],
  ["strawberry", "Strawberry", "Fraise", "FRUIT", "g", 250, 32, 0.7, 0.3, 0, 7.7, 4.9, 2, 1],
  ["blueberry", "Blueberry", "Myrtille", "FRUIT", "g", 125, 57, 0.7, 0.3, 0, 14.5, 10, 2.4, 1],
  ["raspberry", "Raspberry", "Framboise", "FRUIT", "g", 125, 52, 1.2, 0.7, 0, 12, 4.4, 6.5, 1],
  ["blackberry", "Blackberry", "Mûre", "FRUIT", "g", 125, 43, 1.4, 0.5, 0, 10, 4.9, 5.3, 1],
  ["grape", "Grape", "Raisin", "FRUIT", "g", 250, 69, 0.7, 0.2, 0.1, 18, 16, 0.9, 2],
  ["watermelon", "Watermelon", "Pastèque", "FRUIT", "g", 500, 30, 0.6, 0.2, 0, 7.6, 6.2, 0.4, 1],
  ["cantaloupe", "Cantaloupe", "Melon", "FRUIT", "pcs", 1, 34, 0.8, 0.2, 0, 8.2, 7.9, 0.9, 16],
  ["pineapple", "Pineapple", "Ananas", "FRUIT", "pcs", 1, 50, 0.5, 0.1, 0, 13, 10, 1.4, 1],
  ["mango", "Mango", "Mangue", "FRUIT", "pcs", 1, 60, 0.8, 0.4, 0.1, 15, 14, 1.6, 1],
  ["kiwi", "Kiwi", "Kiwi", "FRUIT", "pcs", 1, 61, 1.1, 0.5, 0, 15, 9, 3, 3],
  ["peach", "Peach", "Pêche", "FRUIT", "pcs", 1, 39, 0.9, 0.3, 0, 10, 8.4, 1.5, 0],
  ["pear", "Pear", "Poire", "FRUIT", "pcs", 1, 57, 0.4, 0.1, 0, 15, 10, 3.1, 1],
  ["plum", "Plum", "Prune", "FRUIT", "pcs", 1, 46, 0.7, 0.3, 0, 11, 9.9, 1.4, 0],
  ["cherry", "Cherry", "Cerise", "FRUIT", "g", 200, 63, 1.1, 0.2, 0, 16, 13, 2.1, 0],
  ["apricot", "Apricot", "Abricot", "FRUIT", "pcs", 1, 48, 1.4, 0.4, 0, 11, 9.2, 2, 1],
  ["fig", "Fig", "Figue", "FRUIT", "pcs", 1, 74, 0.8, 0.3, 0.1, 19, 16, 2.9, 1],
  ["pomegranate", "Pomegranate", "Grenade", "FRUIT", "pcs", 1, 83, 1.7, 1.2, 0.1, 19, 14, 4, 3],
  ["lemon-juice", "Lemon juice", "Jus de citron", "FRUIT", "ml", 100, 22, 0.35, 0.24, 0.04, 6.9, 2.5, 0.3, 1],
  ["lime-juice", "Lime juice", "Jus de citron vert", "FRUIT", "ml", 100, 25, 0.4, 0.1, 0, 8.4, 1.7, 0.4, 2],
  ["clementine", "Clementine", "Clémentine", "FRUIT", "pcs", 6, 47, 0.9, 0.2, 0, 12, 9, 1.7, 1],
  ["raisins-dried", "Raisins", "Raisins secs", "FRUIT", "g", 200, 299, 3.1, 0.5, 0.1, 79, 59, 3.7, 11],
  ["prunes-dried", "Prunes", "Pruneaux", "FRUIT", "g", 250, 240, 2.2, 0.4, 0, 64, 38, 7.1, 2],
  ["grapefruit", "Grapefruit", "Pamplemousse", "FRUIT", "pcs", 1, 42, 0.8, 0.1, 0, 11, 7, 1.6, 0],
  ["avocado", "Avocado", "Avocat", "FRUIT", "pcs", 1, 160, 2, 15, 2.1, 9, 0.7, 7, 7],
  ["coconut-fresh", "Coconut", "Noix de coco", "FRUIT", "g", 200, 354, 3.3, 33, 29.7, 15, 6.2, 9, 20],

  // ── Grains ──────────────────────────────────────────────────────────────────────────────
  ["white-rice", "White rice", "Riz blanc", "GRAIN", "g", 500, 352, 7, 0.9, 0.2, 78, 0.2, 1, 2],
  ["brown-rice", "Brown rice", "Riz complet", "GRAIN", "g", 500, 350, 7, 2.8, 0.6, 71.4, 0.7, 5, 4],
  ["pasta-dry", "Pasta", "Pâtes", "GRAIN", "g", 500, 371, 13, 1.5, 0.3, 75, 2.7, 3.2, 6],
  ["whole-wheat-pasta", "Whole wheat pasta", "Pâtes complètes", "GRAIN", "g", 500, 348, 14.6, 2.5, 0.5, 71, 3, 10.7, 7],
  ["flour-all-purpose", "All-purpose flour", "Farine blanche", "GRAIN", "g", 1000, 364, 10.3, 1, 0.2, 76, 0.3, 2.7, 2],
  ["whole-wheat-flour", "Whole wheat flour", "Farine complète", "GRAIN", "g", 1000, 340, 13.2, 2.5, 0.4, 72, 0.4, 10.7, 2],
  ["oats", "Oats", "Flocons d'avoine", "GRAIN", "g", 500, 389, 16.9, 6.9, 1.2, 66, 0, 10.6, 2],
  ["quinoa", "Quinoa", "Quinoa", "GRAIN", "g", 500, 368, 14.1, 6.1, 0.7, 64, 0, 7, 5],
  ["couscous", "Couscous", "Semoule de couscous", "GRAIN", "g", 500, 376, 12.8, 0.6, 0.1, 77, 0, 5, 10],
  ["bread-white", "White bread", "Pain blanc", "GRAIN", "g", 500, 265, 9, 3.2, 0.7, 49, 5, 2.7, 491],
  ["bread-whole-wheat", "Whole wheat bread", "Pain complet", "GRAIN", "g", 500, 247, 13, 3.4, 0.6, 41, 6, 7, 400],
  ["cornmeal", "Cornmeal", "Farine de maïs", "GRAIN", "g", 500, 370, 7, 3.4, 0.5, 79, 0.5, 7.3, 5],
  ["barley", "Barley", "Orge", "GRAIN", "g", 500, 354, 12.5, 2.3, 0.5, 73, 0.8, 17.3, 9],
  ["bulgur", "Bulgur", "Boulgour", "GRAIN", "g", 500, 342, 12.3, 1.3, 0.2, 76, 0.4, 18.3, 17],
  ["breadcrumbs", "Breadcrumbs", "Chapelure", "GRAIN", "g", 250, 395, 13, 5.3, 1, 72, 6, 4.9, 732],
  ["spaghetti", "Spaghetti", "Spaghetti", "GRAIN", "g", 500, 371, 13, 1.5, 0.3, 75, 2.7, 3.2, 6],
  ["penne", "Penne", "Penne", "GRAIN", "g", 500, 371, 13, 1.5, 0.3, 75, 2.7, 3.2, 6],
  ["macaroni", "Macaroni", "Macaroni", "GRAIN", "g", 500, 371, 13, 1.5, 0.3, 75, 2.7, 3.2, 6],
  ["lasagna-sheets", "Lasagna sheets", "Feuilles de lasagne", "GRAIN", "g", 500, 367, 13.5, 1.6, 0.3, 74, 3.2, 3.4, 8],
  // CIQUAL 9815, pâtes fraîches aux œufs crues. The row carried an estimate at a seventh of its salt.
  ["fresh-tagliatelle", "Fresh tagliatelle", "Tagliatelles fraîches", "GRAIN", "g", 250, 283, 10.1, 1.9, 0.5, 57, 2.5, 3.2, 156],
  ["rice-noodles", "Rice noodles", "Nouilles de riz", "GRAIN", "g", 400, 364, 6, 0.6, 0.2, 82, 0.3, 1.6, 182],
  ["egg-noodles", "Egg noodles", "Nouilles aux œufs", "GRAIN", "g", 400, 384, 14.2, 4.4, 1.1, 71, 1.9, 3.3, 21],
  ["arborio-rice", "Arborio rice", "Riz arborio", "GRAIN", "g", 500, 349, 6.7, 0.6, 0.2, 77, 0.1, 1.4, 1],
  ["basmati-rice", "Basmati rice", "Riz basmati", "GRAIN", "g", 500, 349, 8.1, 0.9, 0.2, 77, 0.1, 1.3, 2],
  ["baguette", "Baguette", "Baguette", "GRAIN", "pcs", 1, 274, 9.3, 1.5, 0.3, 55, 2.6, 2.4, 578],
  ["tortilla-wrap", "Tortilla wrap", "Tortilla", "GRAIN", "pcs", 8, 310, 8.3, 7.9, 3, 51, 2.4, 3, 636],
  ["tortilla-corn", "Corn tortilla", "Tortilla de maïs", "GRAIN", "pcs", 8, 218, 5.7, 2.9, 0.4, 44, 1, 5, 45],
  ["pizza-dough", "Pizza dough", "Pâte à pizza", "GRAIN", "pcs", 1, 265, 8.5, 3.5, 0.9, 49, 2.5, 2.1, 490],
  ["puff-pastry", "Puff pastry", "Pâte feuilletée", "GRAIN", "pcs", 1, 383, 5.2, 25, 12.5, 34, 1, 1.2, 480],
  ["shortcrust-pastry", "Shortcrust pastry", "Pâte brisée", "GRAIN", "pcs", 1, 397, 5.5, 22, 11, 44, 2, 1.5, 460],
  ["polenta", "Polenta", "Polenta", "GRAIN", "g", 500, 358, 8.1, 1.6, 0.3, 79, 0.6, 3.9, 7],
  ["cornstarch", "Cornstarch", "Maïzena", "GRAIN", "g", 250, 381, 0.3, 0.1, 0, 91, 0, 0.9, 9],
  ["cereal-cornflakes", "Cornflakes", "Corn flakes", "GRAIN", "g", 500, 357, 7.5, 0.4, 0.1, 84, 8, 3, 729],
  ["granola", "Granola", "Granola", "GRAIN", "g", 500, 471, 10, 20, 3.2, 61, 20, 7, 26],
  ["jasmine-rice", "Jasmine rice", "Riz jasmin", "GRAIN", "g", 500, 365, 7.1, 0.7, 0.2, 80, 0.1, 1.3, 5],
  ["orzo", "Orzo", "Orzo", "GRAIN", "g", 500, 371, 13, 1.5, 0.3, 75, 2.7, 3.2, 6],
  ["naan", "Naan", "Naan", "GRAIN", "pcs", 4, 291, 9.6, 5.7, 1.4, 50.4, 3.6, 2.2, 465],
  ["burger-bun", "Burger bun", "Pain à burger", "GRAIN", "pcs", 4, 293, 9.1, 5.4, 0.9, 53, 5.9, 3.3, 453],
  // Neither reference measures it: the median of 53 labels on Open Food Facts.
  ["ciabatta", "Ciabatta", "Ciabatta", "GRAIN", "pcs", 1, 259, 8.8, 3.2, 0.6, 49.7, 3.2, 3.2, 424],
  // CIQUAL 26264, the raw potato gnocchi sold in a vacuum pack.
  ["gnocchi", "Gnocchi", "Gnocchi", "GRAIN", "g", 500, 176, 4.7, 1.4, 0.3, 37.2, 3.2, 2.2, 468],

  // ── Meat ────────────────────────────────────────────────────────────────────────────────
  ["chicken-breast", "Chicken breast", "Blanc de poulet", "MEAT", "g", 400, 110, 23.4, 1.5, 0.4, 0, 0, 0, 43],
  ["chicken-thigh", "Chicken leg", "Cuisse de poulet", "MEAT", "g", 400, 192, 17.3, 13.5, 3.9, 0, 0, 0, 86],
  ["ground-beef-80-20", "Ground beef (80/20)", "Bœuf haché (80/20)", "MEAT", "g", 500, 254, 17, 20, 7.8, 0, 0, 0, 66],
  ["beef-steak-sirloin", "Flank steak", "Bavette de bœuf", "MEAT", "g", 300, 133, 20.4, 5.7, 2.2, 0, 0, 0, 34],
  ["pork-chop", "Pork chop", "Côte de porc", "MEAT", "g", 300, 164, 19.8, 9.3, 3.8, 0.4, 0, 0, 49],
  ["pork-loin", "Pork loin", "Filet mignon de porc", "MEAT", "g", 400, 123, 21.2, 4.1, 1.7, 0.4, 0, 0, 44],
  ["bacon", "Bacon", "Lard fumé", "MEAT", "g", 200, 303, 15.6, 26.1, 9.4, 0.8, 0.8, 1, 956],
  // CIQUAL 28900, jambon cuit supérieur: the jambon blanc France buys, at 60% of the salt of
  // USDA's sliced ham, which the row carried.
  ["ham", "Ham", "Jambon", "MEAT", "g", 150, 125, 20.8, 4.3, 1.6, 0.8, 0.8, 0, 749],
  ["ground-turkey", "Ground turkey", "Dinde hachée", "MEAT", "g", 500, 148, 19.7, 7.7, 2, 0, 0, 0, 58],
  ["turkey-breast", "Turkey breast", "Blanc de dinde", "MEAT", "g", 400, 109, 24.1, 1.2, 0.3, 0.5, 0.3, 0, 83],
  ["lamb", "Lamb", "Agneau", "MEAT", "g", 400, 170, 18.3, 10.6, 3.9, 0.5, 0, 0, 79],
  ["duck-breast", "Duck breast", "Magret de canard", "MEAT", "g", 300, 337, 19, 28, 9.7, 0, 0, 0, 74],
  ["sausage-pork", "Pork sausage", "Saucisse de porc", "MEAT", "g", 300, 296, 12, 27, 9.5, 2, 0, 0, 850],
  ["veal", "Veal", "Veau", "MEAT", "g", 400, 124, 20.7, 4.6, 1.6, 0, 0, 0, 61],
  ["beef-ground-90-10", "Lean ground beef (90/10)", "Bœuf haché maigre (90/10)", "MEAT", "g", 500, 176, 20, 10, 4, 0, 0, 0, 66],
  ["chicken-slices", "Sliced cooked chicken", "Blanc de poulet en tranches", "MEAT", "pcs", 4, 111, 21, 2.5, 0.7, 1.2, 0.6, 0, 900],
  ["turkey-slices", "Sliced cooked turkey", "Blanc de dinde en tranches", "MEAT", "pcs", 4, 104, 19, 1.8, 0.5, 2.5, 1.3, 0, 1010],
  ["prosciutto", "Prosciutto", "Jambon cru", "MEAT", "g", 100, 195, 27, 9, 3.2, 0.5, 0, 0, 2340],
  ["salami", "Salami", "Saucisson sec", "MEAT", "g", 150, 407, 22, 34, 12.6, 2.4, 0.6, 0, 1740],
  ["chorizo", "Chorizo", "Chorizo", "MEAT", "g", 150, 455, 24, 38, 14, 1.9, 0.5, 0, 1235],
  ["merguez", "Merguez", "Merguez", "MEAT", "pcs", 6, 314, 15, 28, 11, 1, 0.5, 0, 900],
  ["lardons", "Bacon lardons", "Lardons", "MEAT", "g", 200, 285, 16, 24, 9.5, 0.5, 0, 0, 1400],
  ["chicken-wings", "Chicken wings", "Ailes de poulet", "MEAT", "g", 500, 181, 20.4, 11, 3, 0, 0, 0, 86],
  ["rabbit", "Rabbit", "Lapin", "MEAT", "g", 500, 189, 20.4, 11.6, 4.7, 0.7, 0, 0, 56],
  ["beef-roast", "Beef roast", "Rôti de bœuf", "MEAT", "g", 700, 125, 23.4, 3.5, 1.2, 0, 0, 0, 55],
  ["lamb-leg", "Leg of lamb", "Gigot d'agneau", "MEAT", "g", 1500, 230, 18, 17, 7.5, 0, 0, 0, 65],
  ["pork-roast", "Pork roast", "Rôti de porc", "MEAT", "g", 1000, 190, 21, 11, 4, 0, 0, 0, 60],
  ["chicken-whole", "Whole chicken", "Poulet entier", "MEAT", "pcs", 1, 215, 18.6, 15.1, 4.3, 0, 0, 0, 70],
  ["duck-whole", "Whole duck", "Canard entier", "MEAT", "pcs", 1, 404, 11.5, 39.3, 13.2, 0, 0, 0, 59],
  ["turkey-whole", "Whole turkey", "Dinde entière", "MEAT", "pcs", 1, 144, 21.6, 5.6, 1.5, 0.1, 0.1, 0, 112],
  ["stewing-beef", "Stewing beef", "Bœuf à braiser", "MEAT", "g", 800, 164, 24, 7.5, 2.7, 0, 0, 0, 42],
  ["lamb-mince", "Minced lamb", "Agneau haché", "MEAT", "g", 500, 282, 16.6, 23.4, 10.2, 0, 0, 0, 59],
  ["pork-mince", "Pork mince", "Porc haché", "MEAT", "g", 500, 263, 16.9, 21.2, 7.9, 0, 0, 0, 56],
  // CIQUAL 28479, the butcher's poitrine. References disagree more on belly than on any other cut
  // (CIQUAL's lean poitrine 253 kcal, USDA's 518): this is the cut sold for roasting, between them.
  ["pork-belly", "Pork belly", "Poitrine de porc", "MEAT", "g", 500, 323, 15.9, 28.7, 10.2, 0.2, 0.2, 0, 73],
  ["lamb-shoulder", "Lamb shoulder", "Épaule d'agneau", "MEAT", "g", 1500, 170, 18.3, 10.6, 3.9, 0.5, 0.5, 0, 79],
  ["chicken-thigh-boneless", "Boneless chicken thigh", "Haut de cuisse de poulet désossé", "MEAT", "g", 500, 116, 19.7, 4.1, 1.1, 0, 0, 0, 95],
  // The inner fillet of the breast, so the breast's figures.
  ["chicken-tenders", "Chicken tenders", "Aiguillettes de poulet", "MEAT", "g", 400, 110, 23.4, 1.5, 0.4, 0, 0, 0, 43],
  ["pancetta", "Pancetta", "Pancetta", "MEAT", "g", 150, 342, 20.2, 28.8, 12.5, 0.8, 0.4, 0, 1650],

  // ── Seafood ─────────────────────────────────────────────────────────────────────────────
  ["salmon", "Salmon", "Saumon", "SEAFOOD", "g", 300, 208, 20, 13, 3.1, 0, 0, 0, 59],
  ["tuna-canned-water", "Canned tuna (in water)", "Thon en boîte (au naturel)", "SEAFOOD", "g", 150, 116, 26, 0.8, 0.2, 0, 0, 0, 247],
  ["shrimp", "Shrimp", "Crevette", "SEAFOOD", "g", 300, 85, 20.1, 0.5, 0.1, 0, 0, 0, 119],
  ["cod", "Cod", "Cabillaud", "SEAFOOD", "g", 300, 82, 18, 0.7, 0.1, 0, 0, 0, 54],
  ["tilapia", "Tilapia", "Tilapia", "SEAFOOD", "g", 300, 96, 20, 1.7, 0.6, 0, 0, 0, 52],
  ["sardines", "Sardines", "Sardines", "SEAFOOD", "g", 150, 208, 25, 11, 1.5, 0, 0, 0, 307],
  ["mussels", "Mussels", "Moules", "SEAFOOD", "g", 500, 86, 11.9, 2.2, 0.4, 3.7, 0, 0, 286],
  ["scallops", "Scallops", "Noix de Saint-Jacques", "SEAFOOD", "g", 200, 88, 16.8, 0.8, 0.1, 2.4, 0, 0, 392],
  ["crab", "Crab", "Crabe", "SEAFOOD", "g", 200, 97, 19, 1.5, 0.2, 0, 0, 0, 293],
  ["trout", "Trout", "Truite", "SEAFOOD", "g", 300, 148, 20, 6.6, 1.6, 0, 0, 0, 52],
  ["mackerel", "Mackerel", "Maquereau", "SEAFOOD", "g", 300, 205, 19, 13.9, 3.3, 0, 0, 0, 90],
  ["salmon-smoked", "Smoked salmon", "Saumon fumé", "SEAFOOD", "g", 100, 117, 18.3, 4.3, 0.9, 0, 0, 0, 1880],
  ["squid", "Squid", "Calamar", "SEAFOOD", "g", 300, 92, 15.6, 1.4, 0.4, 3.1, 0, 0, 44],
  ["anchovy", "Anchovy", "Anchois", "SEAFOOD", "g", 50, 131, 20, 4.8, 1.3, 0, 0, 0, 3668],
  ["haddock", "Haddock", "Églefin", "SEAFOOD", "g", 300, 72, 17.3, 0.4, 0.1, 0, 0, 0, 66],
  ["pollock", "Alaska pollock", "Colin d'Alaska", "SEAFOOD", "g", 400, 71, 16.3, 0.6, 0, 0, 0, 0, 190],

  // ── Dairy ───────────────────────────────────────────────────────────────────────────────
  ["milk-whole", "Whole milk", "Lait entier", "DAIRY", "ml", 1000, 61, 3.2, 3.3, 1.9, 4.8, 5.1, 0, 43],
  ["milk-skim", "Skim milk", "Lait écrémé", "DAIRY", "ml", 1000, 34, 3.4, 0.1, 0.1, 5, 5.1, 0, 42],
  ["butter", "Butter", "Beurre", "DAIRY", "g", 250, 717, 0.9, 81, 51, 0.1, 0.1, 0, 11],
  ["cheddar-cheese", "Cheddar cheese", "Cheddar", "DAIRY", "g", 200, 403, 25, 33, 21, 1.3, 0.5, 0, 621],
  ["mozzarella", "Mozzarella", "Mozzarella", "DAIRY", "g", 200, 280, 28, 17, 10, 3.1, 1, 0, 627],
  // CIQUAL 19584, with the energy CIQUAL leaves blank worked out from it by the EU factors.
  ["mascarpone", "Mascarpone", "Mascarpone", "DAIRY", "g", 250, 385, 4.4, 39, 25.7, 4, 4, 0, 32],
  ["camembert", "Camembert", "Camembert", "DAIRY", "pcs", 1, 300, 19.8, 24.3, 15.3, 0.5, 0.5, 0, 842],
  ["raclette-cheese", "Raclette cheese", "Raclette", "DAIRY", "g", 400, 342, 23.4, 27.5, 18.5, 0, 0, 0, 676],
  ["paneer", "Paneer", "Paneer", "DAIRY", "g", 200, 321, 25, 25, 16, 3.6, 2.6, 0, 18],
  ["parmesan", "Parmesan", "Parmesan", "DAIRY", "g", 100, 431, 38, 29, 19, 4.1, 0.9, 0, 1529],
  ["cream-cheese", "Cream cheese", "Fromage à tartiner", "DAIRY", "g", 200, 342, 6, 34, 19, 4.1, 3.2, 0, 321],
  ["plain-yogurt", "Plain yogurt", "Yaourt nature", "DAIRY", "g", 500, 61, 3.5, 3.3, 2.1, 4.7, 4.7, 0, 46],
  ["greek-yogurt", "Greek yogurt", "Yaourt grec", "DAIRY", "g", 500, 59, 10, 0.4, 0.1, 3.6, 3.6, 0, 36],
  ["yogurt-fat-free", "Fat-free yogurt", "Yaourt nature 0%", "DAIRY", "g", 500, 39, 4.8, 0.1, 0, 4.1, 4.1, 0, 57],
  ["heavy-cream", "Heavy cream", "Crème liquide entière", "DAIRY", "ml", 250, 340, 2.8, 36, 23, 2.8, 2.9, 0, 38],
  ["sour-cream", "Sour cream", "Crème aigre", "DAIRY", "g", 250, 198, 2.4, 19.7, 12.6, 4.6, 3.4, 0, 32],
  ["cottage-cheese", "Cottage cheese", "Cottage cheese", "DAIRY", "g", 250, 98, 11, 4.3, 2.7, 3.4, 2.7, 0, 364],
  ["feta", "Feta", "Feta", "DAIRY", "g", 200, 264, 14, 21, 15, 4.1, 4.1, 0, 917],
  ["brie", "Brie", "Brie", "DAIRY", "g", 200, 334, 21, 28, 17.4, 0.5, 0.5, 0, 629],
  // CIQUAL 19585, energy by the EU factors. The row carried USDA's pre-2018 entry, which USDA has
  // since measured at 150.
  ["ricotta", "Ricotta", "Ricotta", "DAIRY", "g", 250, 158, 8.8, 11.9, 8.1, 4, 2.3, 0, 109],
  // CIQUAL 19410, crème de lait 30% épaisse.
  ["creme-fraiche", "Crème fraîche", "Crème fraîche", "DAIRY", "g", 200, 304, 3, 30.7, 20.8, 2.8, 2.7, 0, 28],
  // CIQUAL 19431, crème légère épaisse, 15 to 20% fat.
  // Named as the pot is: "fraîche" is a stopword, so "Crème fraîche légère" read as bare "crème
  // légère" and took the liquid carton's lines from `single-cream`.
  ["creme-fraiche-light", "Light crème fraîche", "Crème fraîche épaisse légère", "DAIRY", "g", 200, 166, 2.8, 15.3, 10.4, 3, 3, 0, 34],
  ["single-cream", "Single cream", "Crème liquide légère", "DAIRY", "ml", 250, 165, 2.9, 15, 9.8, 4, 4, 0, 45],
  ["whipping-cream", "Whipping cream", "Crème à fouetter", "DAIRY", "ml", 250, 292, 2.2, 30, 19, 3.5, 3.5, 0, 38],
  ["milk-semi-skimmed", "Semi-skimmed milk", "Lait demi-écrémé", "DAIRY", "ml", 1000, 46, 3.3, 1.6, 1, 4.8, 4.8, 0, 44],
  ["condensed-milk", "Condensed milk", "Lait concentré sucré", "DAIRY", "g", 400, 321, 7.9, 8.7, 5.5, 54, 54, 0, 127],
  ["evaporated-milk", "Evaporated milk", "Lait concentré non sucré", "DAIRY", "ml", 400, 135, 6.8, 7.6, 4.6, 10, 10, 0, 106],
  ["butter-unsalted", "Unsalted butter", "Beurre doux", "DAIRY", "g", 250, 717, 0.9, 81, 51, 0.1, 0.1, 0, 4],
  ["gruyere", "Gruyère", "Gruyère", "DAIRY", "g", 200, 413, 30, 32, 18.9, 0.4, 0.3, 0, 336],
  // CIQUAL 12110. The row had twice the salt Comté is measured at.
  ["comte", "Comté", "Comté", "DAIRY", "g", 200, 418, 27.2, 34.6, 22.5, 0, 0, 0, 322],
  ["gouda", "Gouda", "Gouda", "DAIRY", "g", 200, 374, 23.2, 31.5, 20.3, 0, 0, 0, 795],
  ["goat-cheese", "Goat cheese", "Fromage de chèvre", "DAIRY", "g", 150, 364, 22, 30, 21, 2.5, 2.5, 0, 415],
  ["blue-cheese", "Blue cheese", "Fromage bleu", "DAIRY", "g", 150, 353, 21, 29, 19, 2.3, 0.5, 0, 1395],
  ["emmental", "Emmental", "Emmental", "DAIRY", "g", 200, 380, 28, 30, 18, 1.4, 0.5, 0, 200],
  ["fromage-blanc", "Fromage blanc", "Fromage blanc", "DAIRY", "g", 500, 74, 8, 3.4, 2.2, 3.5, 3.5, 0, 45],
  ["flavoured-yogurt", "Fruit yogurt", "Yaourt aux fruits", "DAIRY", "pcs", 8, 95, 3.5, 2.6, 1.7, 14.5, 14, 0.3, 50],
  ["butter-salted", "Salted butter", "Beurre demi-sel", "DAIRY", "g", 250, 717, 0.9, 81, 51, 0.1, 0.1, 0, 570],

  // ── Eggs ────────────────────────────────────────────────────────────────────────────────
  ["egg-whole", "Egg", "Œuf", "EGG", "pcs", 6, 143, 12.6, 9.5, 3.1, 0.7, 0.4, 0, 142],
  ["egg-white", "Egg white", "Blanc d'œuf", "EGG", "g", 100, 52, 11, 0.2, 0, 0.7, 0.7, 0, 166],
  ["egg-yolk", "Egg yolk", "Jaune d'œuf", "EGG", "pcs", 6, 322, 15.9, 26.5, 9.6, 3.6, 0.6, 0, 48],

  // ── Legumes ─────────────────────────────────────────────────────────────────────────────
  ["black-beans", "Black beans", "Haricots noirs", "LEGUME", "g", 400, 132, 8.9, 0.5, 0.1, 24, 0.3, 8.7, 1],
  ["kidney-beans", "Kidney beans", "Haricots rouges", "LEGUME", "g", 400, 127, 8.7, 0.5, 0.1, 23, 0.3, 6.4, 1],
  ["chickpeas", "Chickpeas", "Pois chiches", "LEGUME", "g", 400, 164, 8.9, 2.6, 0.3, 27, 4.8, 7.6, 7],
  ["lentils-red", "Red lentils", "Lentilles corail", "LEGUME", "g", 400, 328, 27.7, 0.8, 0.1, 44.9, 1.3, 15.4, 2],
  ["lentils-green", "Green lentils", "Lentilles vertes", "LEGUME", "g", 400, 327, 25.1, 1.8, 0.2, 44.5, 1.1, 16.4, 2],
  ["white-beans-cannellini", "Cannellini beans", "Haricots blancs", "LEGUME", "g", 400, 139, 9.7, 0.4, 0.1, 25, 0.3, 6.3, 2],
  ["pinto-beans", "Pinto beans", "Haricots pinto", "LEGUME", "g", 400, 143, 9, 0.7, 0.1, 26, 0.3, 9, 1],
  ["split-peas", "Split peas", "Pois cassés", "LEGUME", "g", 400, 344, 22.8, 1.4, 0.2, 52, 2.8, 15.8, 15],
  ["edamame", "Edamame", "Edamame", "LEGUME", "g", 300, 121, 11, 5, 0.6, 10, 2.2, 5.2, 6],
  ["soybeans", "Soybeans", "Graines de soja", "LEGUME", "g", 300, 432, 34.5, 19.2, 2.7, 20.8, 7.3, 13, 3],
  ["chickpea-flour", "Chickpea flour", "Farine de pois chiche", "LEGUME", "g", 500, 359, 22.4, 6.7, 0.7, 57.8, 10.9, 10.8, 64],

  // ── Nuts ────────────────────────────────────────────────────────────────────────────────
  ["almonds", "Almonds", "Amandes", "NUT", "g", 150, 579, 21, 50, 3.8, 22, 4.4, 12.5, 1],
  ["almonds-flaked", "Flaked almonds", "Amandes effilées", "NUT", "g", 100, 579, 21, 50, 3.8, 22, 4.4, 12.5, 1],
  ["walnuts", "Walnuts", "Noix", "NUT", "g", 150, 654, 15, 65, 6.1, 14, 2.6, 6.7, 2],
  ["cashews", "Cashews", "Noix de cajou", "NUT", "g", 150, 553, 18, 44, 7.8, 30, 5.9, 3.3, 12],
  ["pistachios", "Pistachios", "Pistaches", "NUT", "g", 150, 560, 20, 45, 5.6, 28, 7.7, 10.6, 1],
  ["pecans", "Pecans", "Noix de pécan", "NUT", "g", 150, 691, 9.2, 72, 6.2, 14, 4, 9.6, 0],
  ["peanuts", "Peanuts", "Cacahuètes", "NUT", "g", 150, 567, 26, 49, 6.3, 16, 4, 8.5, 18],
  ["hazelnuts", "Hazelnuts", "Noisettes", "NUT", "g", 150, 628, 15, 61, 4.5, 17, 4.3, 9.7, 0],
  ["macadamia", "Macadamia nuts", "Noix de macadamia", "NUT", "g", 150, 718, 7.9, 76, 12, 14, 4.6, 8.6, 5],
  ["brazil-nuts", "Brazil nuts", "Noix du Brésil", "NUT", "g", 100, 659, 14, 67, 15.1, 12, 2.3, 7.5, 3],
  ["pine-nuts", "Pine nuts", "Pignons de pin", "NUT", "g", 100, 673, 14, 68, 4.9, 13, 3.6, 3.7, 2],

  // ── Seeds ───────────────────────────────────────────────────────────────────────────────
  ["chia-seeds", "Chia seeds", "Graines de chia", "SEED", "g", 100, 486, 17, 31, 3.3, 42, 0, 34.4, 16],
  ["flax-seeds", "Flax seeds", "Graines de lin", "SEED", "g", 100, 534, 18, 42, 3.7, 29, 1.6, 27.3, 30],
  ["sunflower-seeds", "Sunflower seeds", "Graines de tournesol", "SEED", "g", 150, 584, 21, 51, 4.5, 20, 2.6, 8.6, 9],
  ["pumpkin-seeds", "Pumpkin seeds", "Graines de courge", "SEED", "g", 150, 559, 30, 49, 8.7, 11, 1.4, 6, 7],
  ["sesame-seeds", "Sesame seeds", "Graines de sésame", "SEED", "g", 100, 573, 18, 50, 7, 23, 0.3, 11.8, 11],
  ["hemp-seeds", "Hemp seeds", "Graines de chanvre", "SEED", "g", 100, 553, 31, 49, 4.6, 8.7, 1.5, 4, 5],
  ["poppy-seeds", "Poppy seeds", "Graines de pavot", "SEED", "g", 50, 525, 18, 42, 4.5, 28, 3, 20, 26],

  // ── Herbs ───────────────────────────────────────────────────────────────────────────────
  ["basil", "Basil", "Basilic", "HERB", "g", 30, 23, 3.2, 0.6, 0, 2.7, 0.3, 1.6, 4],
  ["parsley", "Parsley", "Persil", "HERB", "g", 30, 36, 3, 0.8, 0.1, 6.3, 0.9, 3.3, 56],
  ["cilantro", "Cilantro", "Coriandre fraîche", "HERB", "g", 30, 23, 2.1, 0.5, 0, 3.7, 0.9, 2.8, 46],
  ["mint", "Mint", "Menthe", "HERB", "g", 20, 70, 3.8, 0.9, 0.2, 15, 0, 6.8, 31],
  ["thyme", "Thyme", "Thym", "HERB", "g", 15, 101, 5.6, 1.7, 0.5, 24, 1.7, 14, 9],
  ["rosemary", "Rosemary", "Romarin", "HERB", "g", 15, 131, 3.3, 5.9, 2.8, 20, 0, 14.1, 26],
  // No reference measures fresh oregano: CIQUAL's and USDA's only entry is the dried leaf (265 kcal),
  // which this row carried. These are that entry scaled to a fresh leaf's dry matter (~20% against
  // ~90% dried, as fresh thyme and marjoram run), so an estimate, but the right order of magnitude.
  ["oregano-fresh", "Fresh oregano", "Origan frais", "HERB", "g", 15, 59, 2, 1, 0.3, 15.3, 0.9, 9.4, 6],
  ["dill", "Dill", "Aneth", "HERB", "g", 20, 43, 3.5, 1.1, 0, 7, 0, 2.1, 61],
  ["chives", "Chives", "Ciboulette", "HERB", "g", 20, 30, 3.3, 0.7, 0.1, 4.4, 1.9, 2.5, 3],
  ["tarragon", "Tarragon", "Estragon", "HERB", "g", 20, 49, 3.4, 1.1, 0, 6.3, 0, 3.4, 62],
  ["lemongrass", "Lemongrass", "Citronnelle", "HERB", "pcs", 2, 99, 1.8, 0.5, 0.1, 25, 0, 0, 6],
  // CIQUAL 11069, fresh sage. The row carried USDA's ground sage, now `dried-sage`.
  ["sage", "Sage", "Sauge", "HERB", "g", 15, 37, 4, 0, 0, 8, 0.3, 7, 11],
  // Neither USDA nor CIQUAL measures it: India's reference table (NIN, "Nutritive Value of Indian
  // Foods"), which leaves sugars, saturated fat and sodium unmeasured. Written as 0, and a handful
  // of leaves weighs a gram, so the gap moves no label.
  ["curry-leaves", "Curry leaves", "Feuilles de curry", "HERB", "pcs", 20, 108, 6.1, 1, 0, 25.1, 0, 6.4, 0],
  // Tied from parsley, thyme and a bay leaf, and lifted out before serving. These are USDA's three,
  // by the weight a bundle holds them in (half parsley, 40% thyme, 10% bay).
  ["bouquet-garni", "Bouquet garni", "Bouquet garni", "HERB", "pcs", 1, 90, 4.5, 1.9, 0.5, 20.3, 1.1, 9.9, 34],

  // ── Spices ──────────────────────────────────────────────────────────────────────────────
  ["black-pepper", "Black pepper", "Poivre noir", "SPICE", "g", 50, 251, 10.4, 3.3, 1.4, 64, 0.6, 25.3, 20],
  ["cinnamon", "Cinnamon", "Cannelle", "SPICE", "g", 50, 247, 4, 1.2, 0.3, 81, 2.2, 53.1, 10],
  ["cumin", "Cumin", "Cumin", "SPICE", "g", 50, 375, 17.8, 22.3, 1.5, 44, 2.3, 10.5, 168],
  ["paprika", "Paprika", "Paprika", "SPICE", "g", 50, 282, 14.1, 13, 2.1, 54, 10.3, 34.9, 68],
  ["turmeric", "Turmeric", "Curcuma", "SPICE", "g", 50, 312, 9.7, 3.3, 1.1, 65, 3.2, 21.1, 38],
  ["ginger-ground", "Ground ginger", "Gingembre en poudre", "SPICE", "g", 50, 335, 9, 4.2, 1.1, 71, 3.4, 14.1, 27],
  // USDA 171326. The row carried sugars at 28, ten times the entry's 3.
  ["nutmeg", "Nutmeg", "Muscade", "SPICE", "g", 30, 525, 5.8, 36, 26, 49, 3, 20.8, 16],
  // USDA's chili powder, but the salt of the pure ground chili France sells as piment en poudre
  // (USDA cayenne, 30): USDA's is the American blend, salted to 2870.
  ["chili-powder", "Chili powder", "Piment en poudre", "SPICE", "g", 50, 282, 13.5, 14.3, 2.6, 50, 7.2, 34.8, 30],
  ["garam-masala", "Garam masala", "Garam masala", "SPICE", "g", 30, 379, 14, 15, 3, 45, 3, 25, 50],
  ["curry-powder", "Curry powder", "Curry en poudre", "SPICE", "g", 30, 325, 14, 14, 2.2, 56, 2.8, 53, 52],
  ["saffron", "Saffron", "Safran", "SPICE", "g", 1, 310, 11.4, 5.9, 1.6, 65, 0, 3.9, 148],
  // CIQUAL 11060.
  ["herbes-de-provence", "Herbes de Provence", "Herbes de Provence", "SPICE", "g", 30, 283, 11.5, 7.2, 1.9, 63.1, 18.5, 40.1, 35],
  ["ras-el-hanout", "Ras el hanout", "Ras el hanout", "SPICE", "g", 30, 330, 12, 12, 2, 50, 4, 28, 100],
  ["espelette-pepper", "Espelette pepper", "Piment d'Espelette", "SPICE", "g", 30, 282, 13.5, 14.3, 2.6, 50, 7.2, 34.8, 30],
  ["paprika-smoked", "Smoked paprika", "Paprika fumé", "SPICE", "g", 50, 282, 14, 13, 2.1, 54, 10, 35, 68],
  ["mustard-seeds", "Mustard seeds", "Graines de moutarde", "SPICE", "g", 50, 508, 26, 36, 2, 28, 6.8, 12, 13],
  ["cayenne-pepper", "Cayenne pepper", "Poivre de Cayenne", "SPICE", "g", 30, 318, 12, 17.3, 3.3, 57, 10.3, 27.2, 30],
  ["coriander-ground", "Ground coriander", "Coriandre en poudre", "SPICE", "g", 30, 298, 12.4, 17.8, 1, 55, 0, 41.9, 35],
  ["cloves", "Cloves", "Clou de girofle", "SPICE", "g", 20, 274, 6, 13, 4.1, 65, 2.4, 33.9, 277],
  ["cardamom", "Cardamom", "Cardamome", "SPICE", "g", 20, 311, 10.8, 6.7, 0.5, 68, 0, 28, 18],
  ["dried-oregano", "Dried oregano", "Origan séché", "SPICE", "g", 30, 265, 9, 4.3, 1.6, 69, 4.1, 42.5, 25],
  // USDA 171317, whose sodium the row carried at a third.
  ["dried-basil", "Dried basil", "Basilic séché", "SPICE", "g", 30, 233, 23, 4, 2, 50, 0, 37.7, 76],
  // A recipe naming a bare herb means it fresh; the dried jar is another product, written as one.
  ["dried-thyme", "Dried thyme", "Thym séché", "SPICE", "g", 30, 276, 9.1, 7.4, 2.7, 64, 1.7, 37, 55],
  ["dried-rosemary", "Dried rosemary", "Romarin séché", "SPICE", "g", 30, 331, 4.9, 15.2, 7.4, 64, 0, 42.6, 50],
  ["dried-parsley", "Dried parsley", "Persil séché", "SPICE", "g", 30, 292, 26.6, 5.5, 1.4, 51, 7.3, 26.7, 452],
  ["dried-sage", "Dried sage", "Sauge séchée", "SPICE", "g", 30, 315, 10.6, 12.8, 7, 61, 1.7, 40.3, 11],
  ["dried-dill", "Dried dill", "Aneth séché", "SPICE", "g", 30, 253, 20, 4.4, 0.2, 56, 0, 13.6, 208],
  ["dried-mint", "Dried mint", "Menthe séchée", "SPICE", "g", 30, 285, 19.9, 6, 1.6, 52, 0, 29.8, 344],
  ["dried-chives", "Dried chives", "Ciboulette séchée", "SPICE", "g", 10, 311, 21.2, 3.5, 0.6, 64, 0, 26.2, 70],
  ["dried-tarragon", "Dried tarragon", "Estragon séché", "SPICE", "g", 30, 295, 22.8, 7.2, 1.9, 50, 0, 7.4, 62],
  // The powder of a food the catalog also sells fresh: garlic and onion are bulbs, these are jars.
  ["garlic-powder", "Garlic powder", "Ail en poudre", "SPICE", "g", 50, 331, 16.6, 0.7, 0.2, 73, 2.4, 9, 60],
  ["onion-powder", "Onion powder", "Oignon en poudre", "SPICE", "g", 50, 341, 10.4, 1, 0.2, 79, 6.6, 15.2, 73],
  ["bay-leaf", "Bay leaf", "Feuille de laurier", "SPICE", "g", 15, 313, 7.6, 8.4, 2.3, 75, 0, 26.3, 23],
  // Crushed red pepper is the cayenne pod flaked rather than ground, and USDA files it as cayenne.
  ["chili-flakes", "Chilli flakes", "Piment en flocons", "SPICE", "g", 50, 318, 12, 17.3, 3.3, 57, 10.3, 27.2, 30],
  // The ground spice's figures: a stick is the same bark, not yet ground.
  ["cinnamon-stick", "Cinnamon stick", "Bâton de cannelle", "SPICE", "pcs", 10, 247, 4, 1.2, 0.3, 81, 2.2, 53.1, 10],
  ["white-pepper", "Ground white pepper", "Poivre blanc moulu", "SPICE", "g", 50, 296, 10.4, 2.1, 0.6, 68.6, 0, 26.2, 5],
  ["mustard-powder", "Mustard powder", "Moutarde en poudre", "SPICE", "g", 50, 508, 26.1, 36.2, 2, 28.1, 6.8, 12.2, 13],
  ["allspice", "Allspice", "Piment de la Jamaïque", "SPICE", "g", 30, 263, 6.1, 8.7, 2.6, 72.1, 0, 21.6, 77],
  // The French blend, pepper, clove, nutmeg and ginger, in equal parts from those four rows above.
  // Not CIQUAL 11056 "Quatre épices": that entry is allspice, which French also calls quatre-épices.
  ["quatre-epices", "Four-spice blend", "Quatre-épices", "SPICE", "g", 30, 346, 7.8, 14.1, 8.2, 62.3, 2.4, 23.5, 85],
  // No reference measures star anise. These are USDA's anise seed, the nearest spice it measures,
  // and a star weighs half a gram, so the borrowing moves no label.
  ["star-anise", "Star anise", "Anis étoilé", "SPICE", "pcs", 10, 337, 17.6, 15.9, 0.6, 50, 0, 14.6, 16],
  ["coriander-seeds", "Coriander seeds", "Graines de coriandre", "SPICE", "g", 30, 298, 12.4, 17.8, 1, 55, 0, 41.9, 35],

  // ── Oils ────────────────────────────────────────────────────────────────────────────────
  ["olive-oil", "Olive oil", "Huile d'olive", "OIL", "ml", 500, 884, 0, 100, 13.8, 0, 0, 0, 2],
  ["vegetable-oil", "Vegetable oil", "Huile végétale", "OIL", "ml", 1000, 884, 0, 100, 13, 0, 0, 0, 0],
  ["ghee", "Ghee", "Ghee", "OIL", "g", 250, 876, 0.3, 99.5, 62, 0, 0, 0, 2],
  ["coconut-oil", "Coconut oil", "Huile de coco", "OIL", "ml", 500, 862, 0, 100, 87, 0, 0, 0, 0],
  ["sesame-oil", "Sesame oil", "Huile de sésame", "OIL", "ml", 250, 884, 0, 100, 14.2, 0, 0, 0, 0],
  ["canola-oil", "Canola oil", "Huile de colza", "OIL", "ml", 1000, 884, 0, 100, 7.4, 0, 0, 0, 0],
  ["sunflower-oil", "Sunflower oil", "Huile de tournesol", "OIL", "ml", 1000, 884, 0, 100, 10.3, 0, 0, 0, 0],
  ["hazelnut-oil", "Hazelnut oil", "Huile de noisette", "OIL", "ml", 250, 884, 0, 100, 7.4, 0, 0, 0, 0],
  ["peanut-oil", "Peanut oil", "Huile d'arachide", "OIL", "ml", 1000, 884, 0, 100, 16.9, 0, 0, 0, 0],

  // ── Condiments ──────────────────────────────────────────────────────────────────────────
  ["salt", "Salt", "Sel", "CONDIMENT", "g", 500, 0, 0, 0, 0, 0, 0, 0, 38758],
  ["soy-sauce", "Soy sauce", "Sauce soja", "CONDIMENT", "ml", 250, 53, 8, 0.6, 0.1, 4.9, 0.4, 0.8, 5493],
  ["ketchup", "Ketchup", "Ketchup", "CONDIMENT", "g", 500, 101, 1.2, 0.2, 0, 26, 21, 0.4, 1110],
  // CIQUAL 11013, the Dijon a French jar of "moutarde" holds. The row carried USDA's American
  // yellow mustard, at under half its fat and salt. The slug predates that, as `beef-steak-sirloin`'s
  // does: renaming it would seed a second row.
  ["mustard-yellow", "Dijon mustard", "Moutarde", "CONDIMENT", "g", 250, 152, 6.9, 11.2, 0.8, 4.8, 1.7, 0.5, 1860],
  ["mayonnaise", "Mayonnaise", "Mayonnaise", "CONDIMENT", "g", 250, 680, 1, 75, 12, 1, 1, 0, 635],
  ["vinegar-white", "White vinegar", "Vinaigre blanc", "CONDIMENT", "ml", 500, 18, 0, 0, 0, 0.4, 0.1, 0, 2],
  ["balsamic-vinegar", "Balsamic vinegar", "Vinaigre balsamique", "CONDIMENT", "ml", 250, 88, 0.5, 0, 0, 17, 15, 0, 23],
  ["hot-sauce", "Hot sauce", "Sauce piquante", "CONDIMENT", "ml", 150, 11, 0.5, 0.4, 0.1, 1.6, 0.8, 0.3, 2400],
  // CIQUAL 11112, energy by the EU factors. CIQUAL leaves its sugars blank, so those are the row's
  // earlier figure.
  ["harissa", "Harissa", "Harissa", "CONDIMENT", "g", 100, 76, 2.7, 2.9, 0.5, 12.4, 6.9, 5.1, 1120],
  ["vinegar-red-wine", "Red wine vinegar", "Vinaigre de vin rouge", "CONDIMENT", "ml", 500, 19, 0, 0, 0, 0.3, 0.3, 0, 8],
  ["fish-sauce", "Fish sauce", "Nuoc-mâm", "CONDIMENT", "ml", 200, 35, 5.1, 0, 0, 3.6, 3.6, 0, 7850],
  ["tahini", "Tahini", "Purée de sésame", "CONDIMENT", "g", 300, 595, 17, 53.8, 7.6, 21, 0.5, 9.3, 115],
  // CIQUAL 11021.
  ["mustard-wholegrain", "Wholegrain mustard", "Moutarde à l'ancienne", "CONDIMENT", "g", 200, 142, 6.6, 9.9, 0.6, 6.7, 2.2, 4.5, 1960],
  ["rice-vinegar", "Rice vinegar", "Vinaigre de riz", "CONDIMENT", "ml", 250, 18, 0.3, 0, 0, 0.5, 0.5, 0, 6],
  ["oyster-sauce", "Oyster sauce", "Sauce d'huître", "CONDIMENT", "ml", 250, 51, 2.4, 0.3, 0.1, 11, 5, 0.3, 2730],
  ["hoisin-sauce", "Hoisin sauce", "Sauce hoisin", "CONDIMENT", "ml", 250, 220, 3.3, 3.4, 0.6, 44, 30, 2.8, 1615],
  ["miso-paste", "Miso paste", "Miso", "CONDIMENT", "g", 300, 199, 12, 6, 1, 26, 6.2, 5.4, 3728],
  ["curry-paste-red", "Red curry paste", "Pâte de curry rouge", "CONDIMENT", "g", 200, 150, 3, 6, 1, 20, 8, 5, 3000],
  ["preserved-lemon", "Preserved lemon", "Citron confit", "CONDIMENT", "pcs", 4, 30, 1, 0.3, 0, 8, 1.5, 3, 3500],
  ["pesto", "Pesto", "Pesto", "CONDIMENT", "g", 190, 450, 5, 45, 7, 5, 2, 2, 800],
  ["hummus", "Hummus", "Houmous", "CONDIMENT", "g", 200, 166, 7.9, 9.6, 1.4, 14, 0.3, 6, 379],
  ["worcestershire-sauce", "Worcestershire sauce", "Sauce Worcestershire", "CONDIMENT", "ml", 150, 78, 0, 0, 0, 19.5, 14, 0, 980],
  ["tomato-paste", "Tomato paste", "Concentré de tomate", "CONDIMENT", "g", 140, 82, 4.3, 0.5, 0.1, 19, 12, 4.1, 59],
  ["soy-sauce-reduced-salt", "Reduced-salt soy sauce", "Sauce soja réduite en sel", "CONDIMENT", "ml", 250, 57, 9.1, 0.3, 0, 5.6, 0.5, 0.7, 3600],
  ["tamari", "Tamari", "Tamari", "CONDIMENT", "ml", 250, 60, 10.5, 0.1, 0, 5.6, 1.7, 0.8, 5590],
  ["cider-vinegar", "Cider vinegar", "Vinaigre de cidre", "CONDIMENT", "ml", 500, 21, 0, 0, 0, 0.9, 0.4, 0, 5],
  // No reference splits wine vinegar by its wine: both carry USDA's red wine vinegar, as that row does.
  ["white-wine-vinegar", "White wine vinegar", "Vinaigre de vin blanc", "CONDIMENT", "ml", 500, 19, 0, 0, 0, 0.3, 0, 0, 8],
  ["sherry-vinegar", "Sherry vinegar", "Vinaigre de xérès", "CONDIMENT", "ml", 250, 19, 0, 0, 0, 0.3, 0, 0, 8],
  // USDA's raw tamarind pulp, which is what a block or jar of paste is. Labels run from 80 to 300 kcal
  // with how much water the maker added, so no one of them is the paste.
  ["tamarind-paste", "Tamarind paste", "Pâte de tamarin", "CONDIMENT", "g", 200, 239, 2.8, 0.6, 0.3, 62.5, 38.8, 5.1, 28],
  // Neither reference measures these: each is the median of the labels on Open Food Facts (54, 51,
  // 32, 48 and 56 products), sold mostly in France.
  ["sriracha", "Sriracha", "Sauce sriracha", "CONDIMENT", "ml", 250, 130, 1.3, 1, 0.2, 27.6, 19, 1.6, 1800],
  ["mirin", "Mirin", "Mirin", "CONDIMENT", "ml", 250, 260, 0, 0, 0, 58, 40.6, 0, 24],
  ["curry-paste-green", "Green curry paste", "Pâte de curry vert", "CONDIMENT", "g", 200, 133, 2.7, 4.6, 1.1, 13.5, 5, 3.5, 2600],
  ["sweet-chili-sauce", "Sweet chilli sauce", "Sauce chili douce", "CONDIMENT", "ml", 250, 188, 0.5, 0.2, 0, 46, 41, 0, 1101],
  ["mango-chutney", "Mango chutney", "Chutney de mangue", "CONDIMENT", "g", 300, 240, 0.5, 0.5, 0.1, 58.9, 47.6, 0.9, 920],

  // ── Sweeteners ──────────────────────────────────────────────────────────────────────────
  ["white-sugar", "White sugar", "Sucre blanc", "SWEETENER", "g", 1000, 387, 0, 0, 0, 100, 100, 0, 1],
  ["brown-sugar", "Brown sugar", "Sucre roux", "SWEETENER", "g", 500, 380, 0, 0, 0, 98, 97, 0, 28],
  ["honey", "Honey", "Miel", "SWEETENER", "g", 500, 304, 0.3, 0, 0, 82, 82, 0.2, 4],
  ["maple-syrup", "Maple syrup", "Sirop d'érable", "SWEETENER", "ml", 250, 260, 0, 0, 0, 67, 60, 0, 12],
  ["powdered-sugar", "Powdered sugar", "Sucre glace", "SWEETENER", "g", 500, 389, 0, 0, 0, 100, 100, 0, 2],
  ["vanilla-sugar", "Vanilla sugar", "Sucre vanillé", "SWEETENER", "g", 100, 394, 0, 0, 0, 98, 98, 0, 1],
  ["agave-syrup", "Agave syrup", "Sirop d'agave", "SWEETENER", "ml", 250, 310, 0, 0, 0, 76, 68, 0.2, 4],
  // Neither USDA nor CIQUAL lists it: the figures are a palm-flower sugar's label (Ethiquable).
  ["palm-sugar", "Palm sugar", "Sucre de palme", "SWEETENER", "g", 250, 382, 1.5, 0, 0, 94, 86.5, 0, 40],

  // ── Other ───────────────────────────────────────────────────────────────────────────────
  ["water", "Water", "Eau", "OTHER", "l", 1, 0, 0, 0, 0, 0, 0, 0, 0],
  ["vegetable-broth", "Vegetable broth", "Bouillon de légumes", "OTHER", "l", 1, 5, 0.3, 0.1, 0, 0.7, 0.3, 0, 377],
  ["chicken-broth", "Chicken broth", "Bouillon de poulet", "OTHER", "l", 1, 4, 0.6, 0.1, 0, 0.4, 0.2, 0, 343],
  ["beef-broth", "Beef broth", "Bouillon de bœuf", "OTHER", "l", 1, 7, 1, 0.2, 0.1, 0.5, 0.2, 0, 356],
  ["bouillon-cube", "Bouillon cube", "Cube de bouillon", "OTHER", "pcs", 12, 230, 10, 14, 7, 17, 5, 0, 19000],
  // CIQUAL measures no dry vegetable cube: one French label (Carrefour Bio), whose energy Maggi's
  // Kub Légumes agrees with (241).
  ["vegetable-stock-cube", "Vegetable stock cube", "Cube de bouillon de légumes", "OTHER", "pcs", 12, 261, 3.6, 8, 3.9, 45.1, 11, 3.1, 14520],
  // CIQUAL 11169, the dehydrated fond de veau sold in a tub.
  ["veal-stock-powder", "Veal stock powder", "Fond de veau", "OTHER", "g", 100, 343, 8.5, 7.4, 3.2, 61.6, 22.3, 2.1, 6660],
  // Neither reference measures it: the median of three French labels (Gerblé, Gayelord Hauser,
  // Priméal).
  ["nutritional-yeast", "Nutritional yeast", "Levure alimentaire", "OTHER", "g", 150, 331, 45, 4.9, 0.8, 39, 1, 23, 100],
  ["soy-milk", "Soy milk", "Boisson au soja", "OTHER", "l", 1, 45, 3.3, 1.8, 0.3, 3.3, 2.5, 0.5, 40],
  ["tofu-silken", "Silken tofu", "Tofu soyeux", "OTHER", "g", 300, 55, 4.8, 2.7, 0.4, 2.3, 0.6, 0.2, 8],
  // CIQUAL 20987, dried: the sheets a shop sells. The row carried USDA's fresh laver, at a seventh of
  // the energy. CIQUAL leaves saturated fat and sugars blank; those two are laver's shares, scaled.
  ["nori", "Nori seaweed", "Algues nori", "OTHER", "g", 25, 255, 31.5, 1.6, 0.3, 46.8, 1, 36.3, 1980],
  ["orange-blossom-water", "Orange blossom water", "Eau de fleur d'oranger", "OTHER", "ml", 250, 0, 0, 0, 0, 0, 0, 0, 1],
  ["tofu-firm", "Firm tofu", "Tofu ferme", "OTHER", "g", 400, 144, 15.8, 8.7, 1.3, 4.3, 0.6, 2.3, 14],
  ["tempeh", "Tempeh", "Tempeh", "OTHER", "g", 300, 192, 20.3, 10.8, 2.2, 7.6, 0, 0, 9],
  ["seitan", "Seitan", "Seitan", "OTHER", "g", 300, 141, 25, 1.9, 0.3, 5.7, 0.4, 1.2, 340],
  ["baking-powder", "Baking powder", "Levure chimique", "OTHER", "g", 100, 53, 0, 0, 0, 28, 0, 0.2, 10600],
  ["baking-soda", "Baking soda", "Bicarbonate de soude", "OTHER", "g", 250, 0, 0, 0, 0, 0, 0, 0, 27360],
  ["dry-yeast", "Dry yeast", "Levure de boulanger", "OTHER", "g", 50, 325, 40.4, 7.6, 1, 41, 0, 26.9, 51],
  ["gelatin", "Gelatin", "Gélatine", "OTHER", "g", 50, 335, 85.6, 0.1, 0, 0, 0, 0, 196],
  ["dark-chocolate", "Dark chocolate", "Chocolat noir", "OTHER", "g", 200, 546, 4.9, 31, 19, 61, 48, 7, 24],
  ["milk-chocolate", "Milk chocolate", "Chocolat au lait", "OTHER", "g", 200, 535, 7.6, 30, 19, 59, 52, 3.4, 79],
  ["cocoa-powder", "Cocoa powder", "Cacao en poudre", "OTHER", "g", 250, 228, 19.6, 13.7, 8.1, 58, 1.8, 37, 21],
  ["vanilla-extract", "Vanilla extract", "Extrait de vanille", "OTHER", "ml", 50, 288, 0.1, 0.1, 0, 12.7, 12.7, 0, 9],
  ["peanut-butter", "Peanut butter", "Beurre de cacahuète", "OTHER", "g", 350, 588, 25, 50, 10, 20, 9, 6, 17],
  ["coconut-milk", "Coconut milk", "Lait de coco", "OTHER", "ml", 400, 230, 2.3, 24, 21, 5.5, 3.3, 2.2, 15],
  // Neither reference measures it: the median of seven labels on Open Food Facts.
  ["coconut-milk-light", "Light coconut milk", "Lait de coco allégé", "OTHER", "ml", 400, 84, 0.8, 8.3, 6.7, 1.7, 1.2, 0, 12],
  ["almond-milk", "Almond milk", "Lait d'amande", "OTHER", "ml", 1000, 17, 0.6, 1.1, 0.1, 1.5, 1.5, 0.3, 72],
  ["oat-milk", "Oat milk", "Boisson à l'avoine", "OTHER", "ml", 1000, 45, 1, 1.5, 0.2, 6.7, 4, 0.8, 42],
  ["canned-tomatoes", "Canned chopped tomatoes", "Tomates concassées en conserve", "OTHER", "g", 400, 32, 1.6, 0.3, 0, 7.3, 4, 1.9, 186],
  ["passata", "Tomato passata", "Coulis de tomate", "OTHER", "ml", 500, 33, 1.4, 0.2, 0, 6.5, 4.6, 1.3, 14],
  ["tomato-sauce", "Tomato sauce", "Sauce tomate", "OTHER", "g", 400, 50, 1.5, 2, 0.3, 6.5, 5, 1.5, 400],
  ["olives-green", "Green olives", "Olives vertes", "OTHER", "g", 200, 145, 1, 15, 2, 3.8, 0.5, 3.3, 1556],
  ["olives-black", "Black olives", "Olives noires", "OTHER", "g", 200, 115, 0.8, 10.7, 1.4, 6.3, 0, 3.2, 735],
  ["capers", "Capers", "Câpres", "OTHER", "g", 100, 23, 2.4, 0.9, 0.2, 4.9, 0.4, 3.2, 2964],
  ["pickles", "Pickles", "Cornichons", "OTHER", "g", 200, 11, 0.3, 0.2, 0, 2.3, 1.1, 1.2, 1208],
  ["white-wine", "White wine", "Vin blanc", "OTHER", "ml", 750, 82, 0.1, 0, 0, 2.6, 1, 0, 5],
  ["red-wine", "Red wine", "Vin rouge", "OTHER", "ml", 750, 85, 0.1, 0, 0, 2.6, 0.6, 0, 4],
  ["beer", "Beer", "Bière", "OTHER", "ml", 500, 43, 0.5, 0, 0, 3.6, 0, 0, 4],
  ["coffee-ground", "Ground coffee", "Café moulu", "OTHER", "g", 250, 2, 0.1, 0, 0, 0, 0, 0, 2],
  ["black-tea", "Black tea", "Thé noir", "OTHER", "g", 100, 1, 0, 0, 0, 0.3, 0, 0, 3],
  ["orange-juice", "Orange juice", "Jus d'orange", "OTHER", "ml", 1000, 45, 0.7, 0.2, 0, 10.4, 8.4, 0.2, 1],
  ["apple-juice", "Apple juice", "Jus de pomme", "OTHER", "ml", 1000, 46, 0.1, 0.1, 0, 11.3, 9.6, 0.2, 4],
];

/**
 * The emoji a card draws, for the slugs that have one worth drawing.
 *
 * A map rather than two more columns on `Row`: the tuple is already fourteen wide and adding a
 * fifteenth costs every row a re-alignment, for a value most of them do not have a
 * distinct one of. Coverage is meant to be partial — `CATEGORY_EMOJI` answers the rest — so the
 * absence of a slug here is a decision that its category's icon is good enough, not an omission.
 */
const EMOJI: Record<string, string> = {
  // Vegetables
  onion: "🧅", shallot: "🧅", garlic: "🧄", carrot: "🥕", potato: "🥔", "sweet-potato": "🍠",
  tomato: "🍅", eggplant: "🍆", zucchini: "🥒", cucumber: "🥒", "bell-pepper-red": "🫑",
  "bell-pepper-green": "🫑", "cherry-tomato": "🍅", "spring-onion": "🧅", "chili-green": "🌶️",
  "bell-pepper-yellow": "🫑", "onion-red": "🧅", celeriac: "🥬", arugula: "🥬",
  "ginger-fresh": "🫘", jalapeno: "🌶️", "bean-sprouts": "🌱", "bok-choy": "🥬",
  "lambs-lettuce": "🥬",
  broccoli: "🥦", cauliflower: "🥦", "corn-sweet": "🌽", mushroom: "🍄", pumpkin: "🎃",
  "butternut-squash": "🎃", peas: "🫛", "green-beans": "🫛", "chili-red": "🌶️",
  "chili-birds-eye": "🌶️", "scotch-bonnet": "🌶️", "chinese-cabbage": "🥬",
  "chestnut-mushroom": "🍄", watercress: "🥬", "snow-peas": "🫛", "little-gem": "🥬",
  // Fruit
  apple: "🍎", pear: "🍐", banana: "🍌", orange: "🍊", grapefruit: "🍊", lemon: "🍋",
  lime: "🍋", "lemon-juice": "🍋", "lime-juice": "🍋", grape: "🍇", clementine: "🍊", "raisins-dried": "🍇",
  "prunes-dried": "🍑", strawberry: "🍓", blueberry: "🫐", blackberry: "🫐",
  raspberry: "🫐", cherry: "🍒", peach: "🍑", apricot: "🍑", plum: "🍑", pineapple: "🍍",
  mango: "🥭", kiwi: "🥝", avocado: "🥑", watermelon: "🍉", cantaloupe: "🍈",
  "coconut-fresh": "🥥", pomegranate: "🍎",
  // Meat
  bacon: "🥓", lardons: "🥓", ham: "🍖", prosciutto: "🍖", salami: "🍖", lamb: "🍖",
  rabbit: "🍖", "beef-steak-sirloin": "🥩", "beef-roast": "🥩", "beef-ground-90-10": "🥩",
  "ground-beef-80-20": "🥩", veal: "🥩", "pork-chop": "🥩", "pork-loin": "🥩",
  "chicken-breast": "🍗", "chicken-thigh": "🍗", "chicken-wings": "🍗", "chicken-slices": "🍗",
  "chicken-whole": "🍗", "turkey-whole": "🦃", "duck-whole": "🦆",
  "lamb-leg": "🍖", "pork-roast": "🥩",
  "turkey-breast": "🦃", "turkey-slices": "🦃", "ground-turkey": "🦃", "duck-breast": "🦆",
  "sausage-pork": "🌭", merguez: "🌭", chorizo: "🌭", "stewing-beef": "🥩", "lamb-mince": "🍖",
  "pork-mince": "🥩", "pork-belly": "🥓", "lamb-shoulder": "🍖", "chicken-thigh-boneless": "🍗",
  "chicken-tenders": "🍗", pancetta: "🥓",
  // Seafood
  shrimp: "🦐", crab: "🦀", mussels: "🦪", scallops: "🦪", squid: "🦑",
  "salmon-smoked": "🐟",
  // Dairy and eggs
  butter: "🧈", "butter-salted": "🧈", "butter-unsalted": "🧈",
  "egg-whole": "🥚", "egg-white": "🥚", "egg-yolk": "🥚",
  // Grains
  baguette: "🥖", "bread-white": "🍞", "bread-whole-wheat": "🍞", breadcrumbs: "🍞",
  "tortilla-wrap": "🫓", "tortilla-corn": "🫓", "pizza-dough": "🍕", "pasta-dry": "🍝", spaghetti: "🍝", penne: "🍝",
  macaroni: "🍝",
  "whole-wheat-pasta": "🍝", "fresh-tagliatelle": "🍝", "lasagna-sheets": "🍝",
  "egg-noodles": "🍜", "rice-noodles": "🍜", "white-rice": "🍚", "brown-rice": "🍚",
  "basmati-rice": "🍚", "arborio-rice": "🍚", granola: "🥣", "cereal-cornflakes": "🥣",
  "puff-pastry": "🥐", "shortcrust-pastry": "🥐", "jasmine-rice": "🍚", orzo: "🍝", naan: "🫓",
  "burger-bun": "🍔", ciabatta: "🥖", gnocchi: "🥔",
  // Nuts and seeds
  peanuts: "🥜",
  // Sweeteners
  honey: "🍯", "agave-syrup": "🍯", "maple-syrup": "🍁", "white-sugar": "🍬",
  "brown-sugar": "🍬", "powdered-sugar": "🍬", "vanilla-sugar": "🍬", "palm-sugar": "🍬",
  // Condiments
  salt: "🧂", ketchup: "🍅", "tomato-paste": "🍅", mayonnaise: "🥚", "hot-sauce": "🌶️",
  harissa: "🌶️", pesto: "🌿", hummus: "🫘", "vinegar-red-wine": "🍷",
  "fish-sauce": "🐟", tahini: "🥜", "mustard-wholegrain": "🟡",
  "rice-vinegar": "🍚", "oyster-sauce": "🦪", "hoisin-sauce": "🍶", "miso-paste": "🍜",
  "curry-paste-red": "🌶️", "preserved-lemon": "🍋",
  "soy-sauce": "🍶", "soy-sauce-reduced-salt": "🍶", tamari: "🍶", "cider-vinegar": "🍏",
  "white-wine-vinegar": "🍷", "sherry-vinegar": "🍷", sriracha: "🌶️", mirin: "🍶",
  "curry-paste-green": "🌶️", "sweet-chili-sauce": "🌶️", "mango-chutney": "🥭",
  // Spices
  "black-pepper": "🧂", paprika: "🌶️", "cayenne-pepper": "🌶️", "chili-powder": "🌶️",
  "garam-masala": "🧂", "curry-powder": "🧂", saffron: "🌼", "herbes-de-provence": "🌿",
  "ras-el-hanout": "🧂", "espelette-pepper": "🌶️", tarragon: "🌿",
  "paprika-smoked": "🌶️", "mustard-seeds": "🟡", lemongrass: "🌿",
  "ginger-ground": "🫚", "bay-leaf": "🌿", "dried-basil": "🌿", "dried-oregano": "🌿",
  "dried-thyme": "🌿", "dried-rosemary": "🌿", "dried-parsley": "🌿", "dried-sage": "🌿",
  "dried-dill": "🌿", "dried-mint": "🌿", "dried-chives": "🌿", "dried-tarragon": "🌿",
  "garlic-powder": "🧄", "onion-powder": "🧅", "chili-flakes": "🌶️", "mustard-powder": "🟡",
  "star-anise": "⭐", "bouquet-garni": "🌿",
  // Oils
  "olive-oil": "🫒", "coconut-oil": "🥥", ghee: "🧈", "hazelnut-oil": "🌰", "peanut-oil": "🥜",
  // Everything else
  water: "💧", "coffee-ground": "☕", "black-tea": "🍵", "orange-juice": "🧃",
  "apple-juice": "🧃", beer: "🍺", "white-wine": "🍷", "red-wine": "🍷",
  "dark-chocolate": "🍫", "milk-chocolate": "🍫", "cocoa-powder": "🍫", "peanut-butter": "🥜",
  "canned-tomatoes": "🥫", passata: "🥫", "tomato-sauce": "🥫", "coconut-milk": "🥥", "almond-milk": "🥛",
  "oat-milk": "🥛", "soy-milk": "🥛", "tofu-silken": "🧆", nori: "🍜",
  "orange-blossom-water": "🌸", "olives-green": "🫒", "olives-black": "🫒", capers: "🫒", pickles: "🥒", "tofu-firm": "🧆",
  tempeh: "🧆", seitan: "🧆", "beef-broth": "🍲", "chicken-broth": "🍲",
  "vegetable-broth": "🍲", "bouillon-cube": "🍲", "baking-powder": "🧂", "baking-soda": "🧂",
  "dry-yeast": "🍞",
  gelatin: "🍮", "vanilla-extract": "🫙", "vegetable-stock-cube": "🍲", "veal-stock-powder": "🍲",
  "coconut-milk-light": "🥥",
};

/** The fallback, so no row is ever emoji-less and no card ever draws a blank. */
const CATEGORY_EMOJI: Record<Category, string> = {
  VEGETABLE: "🥬", FRUIT: "🍎", GRAIN: "🌾", MEAT: "🍖", SEAFOOD: "🐟", DAIRY: "🧀",
  EGG: "🥚", LEGUME: "🫘", NUT: "🌰", SEED: "🌱", HERB: "🌿", SPICE: "🧂", OIL: "🫗",
  CONDIMENT: "🫙", SWEETENER: "🍯", OTHER: "🛒",
};

/**
 * The other ways a household says an ingredient, for the slugs where it matters.
 *
 * Sparse on purpose, and French-leaning because that is what the app is used in. A synonym earns a
 * place here when someone would plausibly type it into the navigation bar and otherwise find
 * nothing — "patates", "coulis", "viande hachée" — not to record every dictionary variant.
 *
 * Accents are written naturally; `seedIngredients` indexes both the accented and unaccented form,
 * so "creme" and "crème" both find it.
 */
const ALIASES: Record<string, { fr?: string[]; en?: string[] }> = {
  // A variety or a harvest, not another food: the figures and the shopping are the same tuber.
  potato: {
    fr: ["patates", "pomme de terre nouvelle", "pomme de terre à chair ferme"],
    en: ["spuds", "new potato", "waxy potato"],
  },
  // The onion France sells by default is the yellow one; naming its colour buys the same net.
  onion: { fr: ["oignon jaune"], en: ["yellow onion", "brown onion"] },
  // Young leaves are sold in a bag beside the mature ones, cooked and eaten the same way.
  // `feuille` names a part of a plant, so it is no stopword (see `STOPWORDS_FR`): the leafy rows
  // carry it here, and the herbs have theirs generated by `_formsSoldAs`.
  spinach: {
    fr: ["jeune pousse d'épinard", "pousse d'épinard", "feuilles d'épinards"],
    en: ["baby spinach", "spinach leaves"],
  },
  // "clove" measures garlic and names a spice, so it is no stopword (see `STOPWORDS_EN`): the
  // garlic phrasings are spelled out here, where the word garlic is what tells the two apart.
  // "clove of garlic" also covers "1 clove garlic" — both reduce to `clove garlic`. `gousse` is the
  // French `clove`, out of `STOPWORDS_FR` for the same reason.
  garlic: { fr: ["gousse d'ail"], en: ["garlic clove", "clove of garlic"] },
  // Sold in sheets in France, and counted in them by every recipe that sets a cream.
  gelatin: { fr: ["feuilles de gélatine"], en: ["gelatin sheets", "gelatine leaves"] },
  cloves: { en: ["ground cloves"] },
  "sweet-potato": { fr: ["patate douce"] },
  // "passata" alone scored 0.70 as one word of the English name, below the bar, and the ranker
  // then linked it to the tin of chopped tomatoes sitting next to it in the candidate list.
  passata: { fr: ["coulis de tomate", "coulis", "passata", "purée de tomate"] },
  "canned-tomatoes": {
    fr: ["tomates concassées", "tomates pelées", "pulpe de tomate", "tomates en conserve"],
  },
  // Cooked and seasoned, so its own row rather than an alias of passata: oil and salt it lacks.
  "tomato-sauce": { fr: ["sauce tomate cuisinée", "sauce napolitaine"] },
  // "double" and "tube de" are not stripped, so the name alone fell to the bar and lost to the tin.
  "tomato-paste": { fr: ["double concentré de tomate", "tube de concentré de tomate"] },
  "bell-pepper-red": { fr: ["poivron"] },
  mushroom: { fr: ["champignons", "champignon de paris"] },
  cilantro: { fr: ["coriandre"] },
  "creme-fraiche": { fr: ["crème", "crème fraîche épaisse"] },
  // The plain word for milk, in both languages, on the carton France buys most. Unaliased, "milk"
  // tied every two-word milk at 0.70 and the index put oat, almond and coconut milk first.
  "milk-semi-skimmed": { fr: ["lait", "lait UHT"], en: ["milk"] },
  // Sold only as a powder or ground, so the bare word means the one row there is. Unaliased, the
  // row's own "en poudre" or "moulu" counts as a word nobody typed, and the bare word fell to 0.70.
  "cocoa-powder": { fr: ["cacao"], en: ["cocoa"] },
  "coffee-ground": { fr: ["café"], en: ["coffee"] },
  "heavy-cream": { fr: ["crème liquide", "crème entière"] },
  // The beef France sells as plain "bœuf haché" is this one; a recipe naming no fat means it.
  "ground-beef-80-20": { fr: ["viande hachée", "steak haché", "bœuf haché"], en: ["ground beef", "minced beef"] },
  "beef-ground-90-10": { fr: ["viande hachée maigre"] },
  "chicken-breast": { fr: ["blanc de poulet", "escalope de poulet"] },
  // The whole leg, as France sells a cuisse; English recipes buy the same piece as a thigh.
  "chicken-thigh": { en: ["chicken thigh"] },
  // The slug predates the row's cut: it is the French bavette, flank, never a sirloin.
  "beef-steak-sirloin": { fr: ["bavette"], en: ["bavette"] },
  // Not bare "poulet": a line reading "500 g de poulet" means pieces, and belongs on a part row.
  "chicken-whole": { fr: ["poulet fermier"] },
  "egg-whole": { fr: ["oeufs", "œufs"] },
  "pasta-dry": { fr: ["pâtes"] },
  "white-rice": { fr: ["riz"] },
  "flour-all-purpose": { fr: ["farine", "farine de blé"], en: ["plain flour", "wheat flour"] },
  "white-sugar": { fr: ["sucre", "sucre semoule", "sucre en poudre"], en: ["caster sugar", "superfine sugar"] },
  // Unrefined cane sugar, which France sells as blond: the same row a cupboard covers it from.
  "brown-sugar": {
    fr: ["cassonade", "sucre blond", "sucre de canne blond"],
    en: ["light brown sugar", "golden caster sugar"],
  },
  cornstarch: { fr: ["fécule de maïs"] },
  honey: { fr: ["miel liquide"] },
  // Extra virgin is a grade, not another food: a cupboard holding either covers a recipe asking for
  // the other. CIQUAL files it apart, so without these the recipe import invented a second row.
  "olive-oil": {
    fr: ["huile d'olive", "huile", "huile d'olive vierge extra", "huile d'olive extra-vierge", "huile d'olive vierge"],
    en: ["extra virgin olive oil", "extra-virgin olive oil", "virgin olive oil"],
  },
  // The spellings `_formsSoldAs` cannot generate: other words for the spice, not its form.
  "black-pepper": { fr: ["poivre", "poivre du moulin", "poivre moulu"] },
  // Without it "noix de muscade" tied with the walnuts on the shared word.
  nutmeg: { fr: ["noix de muscade", "noix de muscade moulue", "noix de muscade en poudre"] },
  paprika: { fr: ["paprika doux"] },
  "cayenne-pepper": { fr: ["piment de cayenne", "piment de cayenne en poudre"], en: ["cayenne"] },
  "ginger-ground": { fr: ["gingembre moulu"] },
  "coriander-ground": { fr: ["coriandre moulue"] },
  "garlic-powder": {
    fr: ["poudre d'ail", "granulés d'ail", "ail granulé", "ail en granulés"],
    en: ["garlic granules", "granulated garlic"],
  },
  "onion-powder": {
    fr: ["poudre d'oignon", "oignon semoule", "oignon granulé", "granulés d'oignon"],
    en: ["onion granules", "granulated onion"],
  },
  "dried-thyme": { fr: ["thym sec"] },
  "dried-rosemary": { fr: ["romarin sec"] },
  "dried-parsley": { fr: ["persil sec"], en: ["parsley flakes"] },
  "dried-sage": { fr: ["sauge sèche"], en: ["ground sage", "rubbed sage"] },
  "dried-dill": { en: ["dill weed", "dried dill weed"] },
  "dried-mint": { fr: ["menthe sèche"] },
  "dried-chives": { en: ["freeze-dried chives"] },
  "dried-tarragon": { fr: ["estragon sec"] },
  // Sold dried; a fresh leaf is rare enough that a recipe naming it would say so.
  "bay-leaf": { fr: ["laurier", "feuille de laurier séchée"], en: ["dried bay leaf", "bay leaves"] },
  salt: { fr: ["fleur de sel", "gros sel", "sel fin", "sel marin", "sel en flocons"], en: ["sea salt", "sea salt flakes"] },
  "mustard-yellow": { fr: ["moutarde de dijon"] },
  // A British recipe says "stock" where this row says "broth". Without these, "chicken stock"
  // scored 0.45 here and was linked to a stock CUBE the import had invented.
  "chicken-broth": { fr: ["bouillon de volaille", "bouillon de poule"], en: ["chicken stock"] },
  "vegetable-broth": { en: ["vegetable stock"] },
  "beef-broth": { en: ["beef stock"] },
  // "tomato ketchup" tied Ketchup and Tomato at 0.5, and the tie went to the tomato.
  ketchup: { en: ["tomato ketchup"] },
  lemon: { fr: ["citron jaune"] },
  parsley: { fr: ["persil plat"] },
  couscous: { fr: ["semoule"] },
  "plain-yogurt": { fr: ["yaourt", "yaourts"] },
  emmental: { fr: ["fromage râpé", "râpé"] },
  baguette: { fr: ["pain"] },
  "bread-white": { fr: ["pain de mie"] },
  "tuna-canned-water": { fr: ["thon"] },
  shrimp: { fr: ["crevettes", "gambas"], en: ["prawn", "king prawn"] },
  chickpeas: { fr: ["pois chiches"] },
  lardons: { fr: ["lardon"] },
  bacon: { fr: ["poitrine fumée", "poitrine de porc fumée"], en: ["smoked pork belly"] },
  // A recipe writing "de la salade" means leaves, and the catalog's only leaves are these.
  "lettuce-romaine": {
    fr: ["salade", "salade verte", "feuilles de salade", "feuilles de laitue"],
    en: ["lettuce leaves"],
  },
  "spring-onion": { fr: ["oignon nouveau", "cébette", "ciboule"] },
  "bouillon-cube": {
    fr: ["bouillon cube", "tablette de bouillon", "cube de bouillon de volaille", "cube de bouillon de poulet", "cube de bouillon de bœuf"],
    en: ["stock cube", "chicken stock cube", "beef stock cube"],
  },
  // A vegetable cube is a row of its own, not an alias of the one above: that one is omnivore.
  "vegetable-stock-cube": {
    fr: ["bouillon cube de légumes", "tablette de bouillon de légumes", "bouillon de légumes en poudre"],
    en: ["vegetable bouillon cube", "vegetable bouillon powder"],
  },
  "curry-powder": { fr: ["curry"] },
  hummus: { en: ["houmous"] },
  // Dried by nature, so a recipe that says so anyway still means this row.
  "raisins-dried": { fr: ["raisin sec", "raisins séchés"], en: ["dried raisins"] },
  "prunes-dried": { fr: ["pruneau", "pruneaux séchés", "pruneau sec"], en: ["dried prunes", "dried plums"] },
  "fish-sauce": { fr: ["sauce poisson", "nuoc mam"] },
  tahini: { fr: ["tahini", "tahiné"] },
  "soy-milk": { fr: ["lait de soja"] },
  "salmon-smoked": { fr: ["saumon fume"] },
  // ⚠️ This does NOT win bare "gingembre" — `ginger-ground` is named "Gingembre en poudre" and
  //    takes it at 1.00 against this alias's 0.90. The alias is here so the fresh root is the
  //    runner-up rather than absent, which is what a cook writing "gingembre râpé" needs.
  "ginger-fresh": { fr: ["gingembre", "gingembre râpé"] },
  // "Tofu ferme" scores only 0.70 on the bare word, so `tofu` reached the model every time. Firm
  // is what an unqualified recipe line means — silken is always written as such.
  "tofu-firm": { fr: ["tofu"] },
  "bean-sprouts": { fr: ["pousses de soja"] },
  "curry-paste-red": { fr: ["pâte de curry"] },
  ghee: { fr: ["beurre clarifié"] },
  nori: { fr: ["feuilles de nori"] },
  // -- Spellings the recipe import created rows for, on the rows they meant ----------------------
  // Each one was a second row on dev, linked from at least two recipes: the matcher missed the row
  // the catalog already had. A grade or a style of the same food, as `olive-oil` reads it above.
  "chili-powder": { en: ["chilli powder"] },
  "hot-sauce": { fr: ["sauce pimentée"] },
  "white-wine": { fr: ["vin blanc sec"], en: ["dry white wine"] },
  salmon: { fr: ["pavé de saumon", "filet de saumon"], en: ["salmon fillet"] },
  "soy-sauce": { fr: ["sauce soja claire", "sauce soja foncée"], en: ["light soy sauce", "dark soy sauce"] },
  "arborio-rice": { fr: ["riz à risotto"], en: ["risotto rice"] },
  "vegetable-oil": { fr: ["huile neutre"], en: ["neutral oil"] },
  "sesame-oil": { fr: ["huile de sésame grillé"], en: ["toasted sesame oil"] },
  "sesame-seeds": { fr: ["graines de sésame grillées"], en: ["toasted sesame seeds"] },
  broccoli: { fr: ["fleurettes de brocoli", "bouquets de brocoli"], en: ["broccoli florets"] },
  tomato: { fr: ["tomate roma"], en: ["plum tomato", "roma tomato"] },
  "cheddar-cheese": { fr: ["cheddar affiné"], en: ["mature cheddar", "sharp cheddar"] },
  "whole-wheat-pasta": { fr: ["spaghetti complets"], en: ["wholewheat spaghetti", "whole wheat spaghetti"] },
  peanuts: { fr: ["cacahuètes grillées"], en: ["roasted peanuts"] },
  pomegranate: { fr: ["graines de grenade"], en: ["pomegranate seeds"] },
  "tortilla-wrap": { fr: ["tortilla de blé"], en: ["flour tortilla"] },
  // -- The rows promoted from dev ----------------------------------------------------------------
  "chili-red": { fr: ["piment rouge frais"], en: ["red chili", "red chili pepper", "red chilli pepper"] },
  "chili-birds-eye": { fr: ["piment oiseau rouge"], en: ["bird's eye chili", "thai chili"] },
  "scotch-bonnet": { fr: ["piment antillais"], en: ["scotch bonnet"] },
  "chinese-cabbage": { fr: ["chou de pékin", "pé-tsaï"], en: ["napa cabbage"] },
  "chestnut-mushroom": {
    fr: ["champignon de paris brun", "champignons bruns"],
    en: ["cremini mushroom", "crimini mushroom", "baby bella mushroom"],
  },
  watercress: { fr: ["cresson de fontaine"] },
  "snow-peas": { fr: ["pois mange-tout", "mange-tout"], en: ["mangetout"] },
  "little-gem": { fr: ["laitue sucrine"], en: ["little gem"] },
  "jasmine-rice": { fr: ["riz thaï"], en: ["thai jasmine rice"] },
  orzo: { fr: ["pâtes langues d'oiseau", "risoni"], en: ["risoni"] },
  naan: { fr: ["pain naan"], en: ["naan bread"] },
  "burger-bun": { fr: ["pain à hamburger", "pain hamburger", "pain burger"], en: ["hamburger bun"] },
  // "Pot-au-feu" is the dish, so not alone: the cuts, and the way a butcher's label words them.
  "stewing-beef": {
    fr: ["bœuf à bourguignon", "bœuf pour bourguignon", "bœuf à mijoter", "paleron", "macreuse"],
    en: ["braising beef", "beef stew meat", "beef chuck"],
  },
  "lamb-mince": { fr: ["viande hachée d'agneau"], en: ["ground lamb", "lamb mince"] },
  "pork-mince": { fr: ["viande hachée de porc"], en: ["ground pork", "minced pork"] },
  // Fresh: "poitrine fumée" is `bacon`.
  "pork-belly": { fr: ["poitrine de porc fraîche", "ventre de porc"], en: ["pork belly slices"] },
  "lamb-shoulder": { en: ["shoulder of lamb"] },
  "chicken-thigh-boneless": {
    fr: ["haut de cuisse désossé", "filet de haut de cuisse de poulet"],
    en: ["boneless skinless chicken thigh", "chicken thigh fillet"],
  },
  "chicken-tenders": { fr: ["aiguillette de poulet"], en: ["chicken tenderloin"] },
  // Not "haddock": in France that is the smoked fish, a product of its own.
  haddock: { fr: ["aiglefin", "filet d'églefin"] },
  pollock: { fr: ["lieu d'alaska", "filet de colin"], en: ["pollock", "pollock fillet"] },
  // Not bare "crème légère", nor anything that reduces to it: a recipe writes that of the liquid
  // carton too, `single-cream`.
  "creme-fraiche-light": {
    fr: ["crème fraîche allégée", "crème épaisse légère"],
    en: ["light crème fraîche", "half-fat crème fraîche"],
  },
  "yogurt-fat-free": { fr: ["yaourt 0%", "yaourt écrémé"], en: ["fat free yogurt", "non-fat yogurt"] },
  "chickpea-flour": { fr: ["farine de pois chiches", "besan"], en: ["gram flour", "besan"] },
  "curry-leaves": { fr: ["feuilles de cari", "feuille de curry"], en: ["curry leaf"] },
  "chili-flakes": {
    fr: ["flocons de piment", "piment concassé"],
    en: ["chili flakes", "red pepper flakes", "crushed red pepper", "crushed chillies"],
  },
  "cinnamon-stick": { fr: ["cannelle en bâton"], en: ["cinnamon sticks"] },
  "white-pepper": { fr: ["poivre blanc", "poivre blanc en poudre"], en: ["white pepper"] },
  "mustard-powder": { en: ["dry mustard", "ground mustard", "english mustard powder"] },
  allspice: { fr: ["piment de la jamaïque moulu", "poivre de la jamaïque"], en: ["ground allspice"] },
  "quatre-epices": { fr: ["4 épices", "quatre épices"], en: ["quatre épices", "four spice"] },
  "star-anise": { fr: ["badiane", "étoile de badiane"], en: ["star anise pod"] },
  "coriander-seeds": { fr: ["coriandre en grains", "grains de coriandre"], en: ["whole coriander"] },
  "soy-sauce-reduced-salt": {
    fr: ["sauce soja à teneur réduite en sel", "sauce soja allégée en sel"],
    en: ["low-sodium soy sauce", "low-salt soy sauce", "reduced-sodium soy sauce"],
  },
  tamari: { fr: ["sauce tamari"] },
  "cider-vinegar": { fr: ["vinaigre de cidre de pomme"], en: ["apple cider vinegar"] },
  "tamarind-paste": { fr: ["pulpe de tamarin"], en: ["tamarind pulp"] },
  sriracha: { en: ["sriracha sauce"] },
  "curry-paste-green": { fr: ["pâte de curry vert thaï"], en: ["thai green curry paste"] },
  "sweet-chili-sauce": { fr: ["sauce piment doux", "sauce chili thaï"], en: ["sweet chili sauce", "thai sweet chilli sauce"] },
  "mango-chutney": { fr: ["chutney à la mangue", "chutney mangue"] },
  "veal-stock-powder": { fr: ["fond de veau déshydraté", "fond brun"] },
  "nutritional-yeast": {
    fr: ["levure maltée", "flocons de levure alimentaire", "levure de bière en paillettes"],
    en: ["nutritional yeast flakes", "nooch"],
  },
  "coconut-milk-light": { fr: ["lait de coco léger"], en: ["reduced-fat coconut milk", "lite coconut milk"] },
};

/**
 * What one of an ingredient weighs, in grams — for the rows a household counts rather than weighs,
 * plus the ones written per piece in a recipe whatever the shop sells them by.
 *
 * Hand-compiled like the nutrition values above, for a medium specimen AS SOLD: a whole raw item
 * before trimming, since that is what someone holds when they write "2 onions", and what the
 * shopping list has to buy. Sparse by nature, not by neglect — there is no such thing as one flour
 * (see schema/ingredients.ts).
 *
 * **No exception for bone.** A `poulet entier` is the 1.4 kg bird on the label, carcass and all;
 * the ~1000 g of meat and skin a cook eats off it is `EDIBLE_SHARE` below, and only nutrition reads
 * that. The birds and `chicken-thigh` used to store the meat instead, which billed the cook for
 * the right calories and sent them shopping for a bird 400 g too small.
 *
 * `garlic` is a clove, as every recipe that ever called for one means. Worth writing down only
 * because a shop sells it by the head and the two are ~17x apart, so whatever eventually turns a
 * grocery line into grams should word its quantity in cloves rather than assume a bulb.
 */
const GRAMS_PER_PIECE: Record<string, number> = {
  // Vegetables
  onion: 150, garlic: 5, tomato: 120, cucumber: 300, "bell-pepper-red": 150, zucchini: 200,
  eggplant: 300, "lettuce-romaine": 300, cabbage: 900, "red-cabbage": 900, leek: 150, beet: 100,
  turnip: 120, fennel: 250, artichoke: 130, endive: 100, shallot: 30,
  "bell-pepper-green": 150, "cherry-tomato": 10, "spring-onion": 15, "chili-green": 15,
  "bell-pepper-yellow": 150, "onion-red": 150, celeriac: 800, jalapeno: 15, "bok-choy": 150,
  // Sold by weight, written by the piece — "un morceau de gingembre", "2 bâtons de citronnelle".
  "ginger-fresh": 15, lemongrass: 20, "preserved-lemon": 40, carrot: 80, potato: 170,
  "sweet-potato": 250, cauliflower: 600, broccoli: 350, radish: 10, "brussels-sprouts": 15,
  mushroom: 20, asparagus: 20, "butternut-squash": 1000, pumpkin: 1200,
  // A stalk, not the head — "2 branches de céleri", the way `garlic` is a clove.
  celery: 40,
  "chili-red": 15, "chili-birds-eye": 2, "scotch-bonnet": 10, "chinese-cabbage": 1000,
  "chestnut-mushroom": 20, "snow-peas": 4, "little-gem": 100,
  // A bunch, as "1 botte de cresson" means and as it is sold — unlike a herb, it is counted so.
  watercress: 125,
  // Fruits
  apple: 180, banana: 120, orange: 130, lemon: 100, lime: 65, cantaloupe: 550, pineapple: 900,
  mango: 200, kiwi: 75, peach: 150, pear: 180, plum: 65, apricot: 40, fig: 50, pomegranate: 280,
  grapefruit: 250, avocado: 200, clementine: 70, "prunes-dried": 10, strawberry: 15, cherry: 8,
  // Grains, meat, dairy, egg
  baguette: 250, "tortilla-wrap": 60, "tortilla-corn": 30, "pizza-dough": 250, "puff-pastry": 230,
  "shortcrust-pastry": 230, "chicken-slices": 25, "turkey-slices": 25, merguez: 70,
  "flavoured-yogurt": 125, "egg-whole": 50, "egg-yolk": 17, camembert: 250,
  "chicken-breast": 150, "duck-breast": 350, "pork-chop": 180, "sausage-pork": 80, "egg-noodles": 50,
  naan: 90, "burger-bun": 60, ciabatta: 250, "chicken-thigh-boneless": 100, "chicken-tenders": 35,
  // The whole leg, thigh and drumstick, as a French "cuisse" is sold: ~175 g of it comes off the
  // bone (see `EDIBLE_SHARE`).
  "chicken-thigh": 250,
  // Fish and seafood — a raw peeled prawn, a whole fresh sardine
  shrimp: 15, sardines: 50,
  // One of them out of the packet or the jar — a nori sheet, an olive.
  nori: 3, "olives-black": 4,
  // Whole birds — the weight on the label, carcass included (see `EDIBLE_SHARE`).
  "chicken-whole": 1400, "duck-whole": 2000, "turkey-whole": 4500,
  // A cube, as every recipe that calls for one means, and as the box is portioned.
  "bouillon-cube": 10, "vegetable-stock-cube": 10,
  // Sold by weight, written by the piece — "2 bay leaves", never "0.4g of bay leaf".
  "bay-leaf": 0.2, "cinnamon-stick": 3, "star-anise": 0.5,
  // A leaf, since the row's name counts leaves — "10 feuilles de curry", not ten sprigs.
  "curry-leaves": 0.2,
  // One tied bundle, as it is sold and as every recipe counts it.
  "bouquet-garni": 10,
  // A sprig, as "2 brins de thym" means — sold by the bunch, and nobody counts bunches. A recipe
  // counting basil or sage in LEAVES is read as sprigs too: a gram either way.
  thyme: 1, rosemary: 2, basil: 2, parsley: 2, cilantro: 2, mint: 1, "oregano-fresh": 1, dill: 1,
  tarragon: 1, sage: 1, chives: 0.5,
};

/**
 * What one slice of an ingredient weighs, in grams — for what is sold whole and eaten cut.
 *
 * A recipe writes "8 slices of bread" or "2 tranches de jambon" and the shop sells the loaf and
 * the packet; `gramsPerPiece` says nothing about how thick the knife went. Hand-compiled for the
 * slice a home cook actually cuts or a supermarket packet actually holds: a 1 cm slice of bread, a
 * deli slice of ham, a thin round of lemon. How many slices make a loaf is derived from this and
 * the piece weight (shared/ingredients.ts `toStockUnit`), never stored.
 *
 * `chicken-slices` and `turkey-slices` are sold sliced, so their piece IS a slice — the entry only
 * lets a line written as "2 slices" reach the same weight as one written as "2 pcs". Onions stay
 * out: nobody counts onion slices, and the recipe sanitizer never emits them.
 */
const GRAMS_PER_SLICE: Record<string, number> = {
  // Bread
  baguette: 35, "bread-white": 30, "bread-whole-wheat": 30, ciabatta: 30,
  // Cured and cooked meats, one deli slice
  ham: 20, prosciutto: 15, salami: 5, chorizo: 10, bacon: 15, "chicken-slices": 25,
  "turkey-slices": 25, pancetta: 10,
  // Cheese, one sandwich slice or one round of the log
  "cheddar-cheese": 30, emmental: 30, gruyere: 30, comte: 30, brie: 30, "goat-cheese": 20,
  mozzarella: 25, gouda: 25,
  // Rounds — "rondelles" of a fruit or vegetable
  lemon: 10, lime: 7, tomato: 20, cucumber: 8,
};

/**
 * Density in grams per millilitre, for anything that can be poured or spooned.
 *
 * Wider than the rows whose `defaultUnit` is a volume, because the unit that breaks nutrition is
 * the one a RECIPE uses, not the one a shop sells by: salt, flour, sugar and every spice are bought
 * by weight and written by the spoonful. A line this cannot convert costs the whole recipe its
 * nutrition, so the spoon-measured pantry is the half that matters most.
 *
 * The dry values are for the loose, unsifted, unpacked state a cook actually spoons — flour packs
 * from 0.53 to 0.7 depending on how it is scooped, which is the built-in imprecision of measuring
 * a solid by volume and not something a second decimal here would fix.
 *
 * `mussels` is in its shell, as "1 litre de moules" is bought: 0.75, shells included, so "1 l" and
 * "750 g" of the same purchase weigh the same. The shell leaves the count through `EDIBLE_SHARE`.
 */
const GRAMS_PER_ML: Record<string, number> = {
  // Dairy
  "milk-whole": 1.03, "milk-skim": 1.035, "milk-semi-skimmed": 1.03, "heavy-cream": 0.99,
  "single-cream": 1.01, "whipping-cream": 0.99, "evaporated-milk": 1.07, "condensed-milk": 1.28,
  "sour-cream": 0.98, "creme-fraiche": 0.98, "plain-yogurt": 1.03, "greek-yogurt": 1.05,
  "fromage-blanc": 1.03, butter: 0.91, "butter-unsalted": 0.91, "butter-salted": 0.91,
  "creme-fraiche-light": 1, "yogurt-fat-free": 1.03,
  // Oils
  "olive-oil": 0.91, "vegetable-oil": 0.92, "coconut-oil": 0.92, "sesame-oil": 0.92,
  "canola-oil": 0.92, "sunflower-oil": 0.92, "hazelnut-oil": 0.92, "peanut-oil": 0.92,
  // Condiments
  salt: 1.2, "soy-sauce": 1.15, "vinegar-white": 1.01, "balsamic-vinegar": 1.1, "hot-sauce": 1.05,
  "worcestershire-sauce": 1.1, ketchup: 1.14, "mustard-yellow": 1.05, mayonnaise: 0.91,
  "tomato-paste": 1.07, "peanut-butter": 1.08, capers: 0.85, "olives-green": 0.75, "olives-black": 0.75,
  harissa: 1.05, pesto: 1, mascarpone: 1, hummus: 1.05, "preserved-lemon": 0.9, ghee: 0.91,
  lemongrass: 0.5, "soy-sauce-reduced-salt": 1.15, tamari: 1.15, "cider-vinegar": 1.01,
  "white-wine-vinegar": 1.01, "sherry-vinegar": 1.01, "tamarind-paste": 1.2, sriracha: 1.1,
  mirin: 1.15, "curry-paste-green": 1.1, "sweet-chili-sauce": 1.25, "mango-chutney": 1.25,
  // Grated or chopped fresh, spooned loose — "1 tsp of grated ginger", "2 tbsp of parmesan".
  "ginger-fresh": 0.5, parmesan: 0.35,
  // Sweeteners
  "white-sugar": 0.85, "brown-sugar": 0.8, "powdered-sugar": 0.56, "vanilla-sugar": 0.85, honey: 1.42,
  "maple-syrup": 1.32, "agave-syrup": 1.37, "palm-sugar": 0.8,
  // Dry pantry, spooned
  "flour-all-purpose": 0.53, "whole-wheat-flour": 0.55, cornstarch: 0.6, cornmeal: 0.65,
  polenta: 0.65, breadcrumbs: 0.4, oats: 0.4, "cocoa-powder": 0.5, "baking-powder": 0.92,
  "baking-soda": 1.2, "dry-yeast": 0.75, gelatin: 0.8, "chickpea-flour": 0.5,
  "nutritional-yeast": 0.25, "vegetable-stock-cube": 0.6, "veal-stock-powder": 0.6,
  // Seeds, nuts and pulses, spooned dry
  "chia-seeds": 0.65, "flax-seeds": 0.6, "sesame-seeds": 0.6, "poppy-seeds": 0.6,
  "sunflower-seeds": 0.55, "pumpkin-seeds": 0.55, "hemp-seeds": 0.5, "pine-nuts": 0.6,
  "almonds-flaked": 0.4, peas: 0.6, "lentils-red": 0.8,
  // Ground spices, and the two dried herbs that behave like them
  "black-pepper": 0.45, cinnamon: 0.45, cumin: 0.45, paprika: 0.46, turmeric: 0.5,
  "ginger-ground": 0.5, nutmeg: 0.5, "chili-powder": 0.5, "cayenne-pepper": 0.5,
  "coriander-ground": 0.45, cloves: 0.5, cardamom: 0.45, "dried-oregano": 0.2, "dried-basil": 0.2,
  "dried-thyme": 0.2, "dried-rosemary": 0.24, "dried-parsley": 0.1, "dried-sage": 0.14,
  "dried-dill": 0.2, "dried-mint": 0.1, "dried-chives": 0.02, "dried-tarragon": 0.12,
  "garlic-powder": 0.62, "onion-powder": 0.48,
  "garam-masala": 0.45, "curry-powder": 0.45, saffron: 0.35, "ras-el-hanout": 0.45,
  "espelette-pepper": 0.45, "herbes-de-provence": 0.2, "paprika-smoked": 0.46,
  "mustard-seeds": 0.65, "chili-flakes": 0.36, "white-pepper": 0.5, "mustard-powder": 0.5,
  allspice: 0.45, "quatre-epices": 0.45, "star-anise": 0.45, "coriander-seeds": 0.36,
  // Fresh herbs, chopped — "1 tbsp of parsley". Light enough that the imprecision costs nothing.
  basil: 0.25, parsley: 0.25, cilantro: 0.25, mint: 0.25, thyme: 0.3, rosemary: 0.3, tarragon: 0.3,
  "oregano-fresh": 0.25, dill: 0.25, chives: 0.25, sage: 0.25, "curry-leaves": 0.1,
  // Liquids
  water: 1, "vegetable-broth": 1, "chicken-broth": 1, "beef-broth": 1, "vanilla-extract": 0.88,
  "lemon-juice": 1.02, "lime-juice": 1.03, "coconut-milk-light": 1, "vinegar-red-wine": 1.01, "fish-sauce": 1.02, tahini: 1.07,
  "mustard-wholegrain": 1.05, "soy-milk": 1.03, "rice-vinegar": 1.01, "oyster-sauce": 1.2,
  "hoisin-sauce": 1.2, "miso-paste": 1.2, "curry-paste-red": 1.1, "orange-blossom-water": 1,
  "coconut-milk": 0.98, "almond-milk": 1.03, "oat-milk": 1.03, passata: 1.05, "tomato-sauce": 1.05, "white-wine": 0.99,
  "red-wine": 0.99, beer: 1.01, "orange-juice": 1.05, "apple-juice": 1.05,
  // Shellfish by the litre, in the shell — see the note above.
  mussels: 0.75,
};

/**
 * The share of the as-sold weight that is eaten, for the rows bought with a part nobody eats.
 *
 * Every weight in this file is as sold and every figure is per 100 g eaten, so nutrition counts a
 * line at its weight times this (shared/ingredients.ts `edibleGrams`), and shopping ignores it.
 * It applies in every unit, grams included: "1 kg de moules" is bought in the shell too.
 *
 * **Only where a line in GRAMS of the row conventionally includes the waste**, because the share
 * applies to those lines as well. Estimates from typical yields, not measurements. Left at the
 * whole of it, on purpose:
 * - Fruit and vegetables. A peel, rind or core is bought with them, but "200 g de carottes râpées"
 *   is written trimmed, and a share would undercount it. Their piece weights overcount a little.
 * - `egg-whole`, whose 50 g piece is already the egg out of its shell, as "100 g d'œufs" means.
 * - `shrimp` (a peeled prawn), `crab` (the figures are crab meat), `sardines` (the figures are the
 *   tin, eaten bones and all).
 *
 * Exported for the catalog test, which checks every key names a row: a typo'd one is otherwise
 * silent, and the row it meant keeps counting its bones.
 */
export const EDIBLE_SHARE: Record<string, number> = {
  // Whole birds: meat and skin off the carcass. 1.4 kg of chicken is ~1 kg eaten.
  "chicken-whole": 0.7, "duck-whole": 0.5, "turkey-whole": 0.67,
  // Bone-in cuts, as a French butcher sells them: a cuisse, the wings, a côte, a gigot, an épaule,
  // a lapin.
  "chicken-thigh": 0.7, "chicken-wings": 0.55, "pork-chop": 0.8, "lamb-leg": 0.75,
  "lamb-shoulder": 0.75, rabbit: 0.65,
  // In the shell, raw meat against live weight.
  mussels: 0.4,
};

/**
 * How many days each ingredient keeps: `sealed` as a shop sells it, `opened` once opened or cut.
 *
 * Compiled by hand from public storage guidance (USDA FoodKeeper, and the use-by a French
 * supermarket pack typically carries), taking the short end of each range without shortening it
 * further. **The form is the one a shop sells**, which is not always the one a recipe names: canned
 * tomatoes, sweet corn and chickpeas are tins, milk and single cream are UHT cartons, peas and
 * edamame are frozen, beetroot comes cooked and vacuum-packed. Fresh meat, fish and produce are
 * the fridge figure. What keeps "indefinitely" (salt, sugar, vinegar) gets a long round number,
 * since a date is always required.
 *
 * `opened` is never more than `sealed`, which the catalog test checks. For produce it is the cut
 * figure, so a bag of potatoes with some left over will read as cut once opening is tracked. That
 * slice will need to decide whether a whole potato left in the bag counts as opened.
 *
 * Total over `ROWS`: the catalog test fails on a slug with no entry, which is also what a typo'd
 * key looks like from the row's side.
 */
const SHELF_LIFE_DAYS: Record<string, { sealed: number; opened: number }> = {
  // -- Vegetables, fresh unless noted --------------------------------------------------------
  onion: { sealed: 30, opened: 7 }, "onion-red": { sealed: 30, opened: 7 },
  shallot: { sealed: 30, opened: 7 }, garlic: { sealed: 60, opened: 7 },
  carrot: { sealed: 21, opened: 7 }, potato: { sealed: 30, opened: 2 },
  "sweet-potato": { sealed: 21, opened: 2 }, tomato: { sealed: 7, opened: 2 },
  "cherry-tomato": { sealed: 7, opened: 3 }, cucumber: { sealed: 7, opened: 2 },
  "bell-pepper-red": { sealed: 7, opened: 3 }, "bell-pepper-green": { sealed: 7, opened: 3 },
  "bell-pepper-yellow": { sealed: 7, opened: 3 }, zucchini: { sealed: 5, opened: 2 },
  eggplant: { sealed: 5, opened: 2 }, broccoli: { sealed: 5, opened: 2 },
  cauliflower: { sealed: 7, opened: 3 }, spinach: { sealed: 5, opened: 2 },
  "lettuce-romaine": { sealed: 5, opened: 2 }, arugula: { sealed: 5, opened: 2 },
  "lambs-lettuce": { sealed: 5, opened: 2 }, cabbage: { sealed: 14, opened: 3 },
  "red-cabbage": { sealed: 14, opened: 3 }, kale: { sealed: 5, opened: 2 },
  celery: { sealed: 14, opened: 5 }, leek: { sealed: 7, opened: 3 },
  mushroom: { sealed: 5, opened: 2 }, pumpkin: { sealed: 30, opened: 5 },
  "butternut-squash": { sealed: 30, opened: 5 }, "green-beans": { sealed: 5, opened: 2 },
  // Frozen.
  peas: { sealed: 240, opened: 90 },
  asparagus: { sealed: 3, opened: 2 }, "brussels-sprouts": { sealed: 5, opened: 3 },
  // Cooked and vacuum-packed, as a French supermarket sells it.
  beet: { sealed: 14, opened: 3 },
  radish: { sealed: 7, opened: 3 }, turnip: { sealed: 14, opened: 3 },
  fennel: { sealed: 7, opened: 3 },
  // Tinned.
  "corn-sweet": { sealed: 730, opened: 3 },
  artichoke: { sealed: 5, opened: 2 }, chard: { sealed: 3, opened: 2 },
  endive: { sealed: 7, opened: 2 }, "spring-onion": { sealed: 5, opened: 3 },
  "chili-green": { sealed: 7, opened: 3 }, jalapeno: { sealed: 7, opened: 3 },
  celeriac: { sealed: 30, opened: 5 }, "ginger-fresh": { sealed: 21, opened: 7 },
  "bean-sprouts": { sealed: 3, opened: 2 }, "bok-choy": { sealed: 3, opened: 2 },
  "chili-red": { sealed: 7, opened: 3 }, "chili-birds-eye": { sealed: 7, opened: 3 },
  "scotch-bonnet": { sealed: 7, opened: 3 }, "chinese-cabbage": { sealed: 10, opened: 3 },
  "chestnut-mushroom": { sealed: 5, opened: 2 }, watercress: { sealed: 3, opened: 2 },
  "snow-peas": { sealed: 5, opened: 2 }, "little-gem": { sealed: 5, opened: 2 },
  // -- Fruit, fresh unless noted -------------------------------------------------------------
  apple: { sealed: 30, opened: 2 }, banana: { sealed: 5, opened: 1 },
  orange: { sealed: 14, opened: 3 }, clementine: { sealed: 7, opened: 2 },
  grapefruit: { sealed: 14, opened: 3 }, lemon: { sealed: 14, opened: 5 },
  lime: { sealed: 14, opened: 5 }, strawberry: { sealed: 3, opened: 2 },
  blueberry: { sealed: 7, opened: 3 }, raspberry: { sealed: 2, opened: 1 },
  blackberry: { sealed: 2, opened: 1 }, grape: { sealed: 7, opened: 3 },
  watermelon: { sealed: 14, opened: 3 }, cantaloupe: { sealed: 5, opened: 3 },
  pineapple: { sealed: 3, opened: 3 }, mango: { sealed: 5, opened: 3 },
  kiwi: { sealed: 7, opened: 3 }, peach: { sealed: 3, opened: 2 },
  pear: { sealed: 5, opened: 2 }, plum: { sealed: 5, opened: 2 },
  cherry: { sealed: 5, opened: 3 }, apricot: { sealed: 3, opened: 2 },
  fig: { sealed: 3, opened: 2 }, pomegranate: { sealed: 30, opened: 3 },
  avocado: { sealed: 4, opened: 2 }, "coconut-fresh": { sealed: 30, opened: 3 },
  // Bottled, and dried.
  "lemon-juice": { sealed: 365, opened: 90 }, "lime-juice": { sealed: 365, opened: 90 },
  "raisins-dried": { sealed: 180, opened: 90 }, "prunes-dried": { sealed: 180, opened: 90 },
  // -- Grains, dry unless noted --------------------------------------------------------------
  "white-rice": { sealed: 730, opened: 365 }, "basmati-rice": { sealed: 730, opened: 365 },
  "arborio-rice": { sealed: 730, opened: 365 }, "brown-rice": { sealed: 180, opened: 90 },
  "jasmine-rice": { sealed: 730, opened: 365 }, orzo: { sealed: 730, opened: 365 },
  "pasta-dry": { sealed: 730, opened: 365 }, spaghetti: { sealed: 730, opened: 365 },
  penne: { sealed: 730, opened: 365 }, macaroni: { sealed: 730, opened: 365 },
  "lasagna-sheets": { sealed: 730, opened: 365 }, "rice-noodles": { sealed: 730, opened: 365 },
  "whole-wheat-pasta": { sealed: 365, opened: 180 }, "egg-noodles": { sealed: 365, opened: 180 },
  "flour-all-purpose": { sealed: 180, opened: 180 }, "whole-wheat-flour": { sealed: 90, opened: 90 },
  cornmeal: { sealed: 365, opened: 180 }, polenta: { sealed: 365, opened: 180 },
  cornstarch: { sealed: 730, opened: 730 }, oats: { sealed: 365, opened: 180 },
  quinoa: { sealed: 730, opened: 365 }, couscous: { sealed: 365, opened: 365 },
  barley: { sealed: 365, opened: 365 }, bulgur: { sealed: 365, opened: 180 },
  breadcrumbs: { sealed: 180, opened: 90 },
  "cereal-cornflakes": { sealed: 180, opened: 60 }, granola: { sealed: 180, opened: 60 },
  // Bread: a baguette is the day's, sliced bread is the packaged loaf.
  baguette: { sealed: 1, opened: 1 },
  "bread-white": { sealed: 14, opened: 7 }, "bread-whole-wheat": { sealed: 14, opened: 7 },
  "tortilla-wrap": { sealed: 30, opened: 7 }, "tortilla-corn": { sealed: 30, opened: 7 },
  naan: { sealed: 10, opened: 3 }, "burger-bun": { sealed: 14, opened: 5 },
  ciabatta: { sealed: 3, opened: 2 },
  // Vacuum-packed, kept in the cupboard until opened.
  gnocchi: { sealed: 60, opened: 3 },
  // Chilled.
  "fresh-tagliatelle": { sealed: 14, opened: 2 }, "pizza-dough": { sealed: 14, opened: 2 },
  "puff-pastry": { sealed: 14, opened: 2 }, "shortcrust-pastry": { sealed: 14, opened: 2 },
  // -- Meat, fresh and chilled unless noted --------------------------------------------------
  "chicken-breast": { sealed: 2, opened: 1 }, "chicken-thigh": { sealed: 2, opened: 1 },
  "chicken-wings": { sealed: 2, opened: 1 }, "chicken-whole": { sealed: 2, opened: 1 },
  "duck-whole": { sealed: 2, opened: 1 }, "turkey-whole": { sealed: 2, opened: 1 },
  "turkey-breast": { sealed: 2, opened: 1 }, rabbit: { sealed: 2, opened: 1 },
  "ground-beef-80-20": { sealed: 2, opened: 1 }, "beef-ground-90-10": { sealed: 2, opened: 1 },
  "ground-turkey": { sealed: 2, opened: 1 }, "sausage-pork": { sealed: 2, opened: 1 },
  merguez: { sealed: 2, opened: 1 },
  "beef-steak-sirloin": { sealed: 3, opened: 2 }, "beef-roast": { sealed: 3, opened: 2 },
  "pork-chop": { sealed: 3, opened: 2 }, "pork-loin": { sealed: 3, opened: 2 },
  "pork-roast": { sealed: 3, opened: 2 }, lamb: { sealed: 3, opened: 2 },
  "lamb-leg": { sealed: 3, opened: 2 }, veal: { sealed: 3, opened: 2 },
  "duck-breast": { sealed: 3, opened: 2 },
  "lamb-mince": { sealed: 2, opened: 1 }, "pork-mince": { sealed: 2, opened: 1 },
  "chicken-thigh-boneless": { sealed: 2, opened: 1 }, "chicken-tenders": { sealed: 2, opened: 1 },
  "stewing-beef": { sealed: 3, opened: 2 }, "pork-belly": { sealed: 3, opened: 2 },
  "lamb-shoulder": { sealed: 3, opened: 2 },
  bacon: { sealed: 7, opened: 5 }, lardons: { sealed: 7, opened: 5 },
  pancetta: { sealed: 30, opened: 5 },
  // Sliced and cooked, or cured, in a sealed pack.
  ham: { sealed: 14, opened: 3 }, "chicken-slices": { sealed: 14, opened: 3 },
  "turkey-slices": { sealed: 14, opened: 3 }, prosciutto: { sealed: 30, opened: 3 },
  // Dry sausages, whole.
  salami: { sealed: 42, opened: 21 }, chorizo: { sealed: 42, opened: 21 },
  // -- Seafood, fresh and chilled unless noted -----------------------------------------------
  salmon: { sealed: 2, opened: 1 }, cod: { sealed: 2, opened: 1 },
  trout: { sealed: 2, opened: 1 }, mackerel: { sealed: 2, opened: 1 },
  squid: { sealed: 2, opened: 1 }, scallops: { sealed: 2, opened: 1 },
  mussels: { sealed: 2, opened: 1 }, haddock: { sealed: 2, opened: 1 },
  // Sold cooked, at the counter or in a tray.
  shrimp: { sealed: 3, opened: 2 },
  // Frozen fillets.
  tilapia: { sealed: 180, opened: 30 }, pollock: { sealed: 180, opened: 30 },
  "salmon-smoked": { sealed: 14, opened: 3 },
  // Tinned.
  "tuna-canned-water": { sealed: 730, opened: 3 }, sardines: { sealed: 730, opened: 3 },
  crab: { sealed: 730, opened: 3 },
  // Fillets in oil, in a tin or a jar.
  anchovy: { sealed: 365, opened: 30 },
  // -- Dairy ---------------------------------------------------------------------------------
  // UHT cartons, the way France buys milk and pouring cream.
  "milk-whole": { sealed: 90, opened: 3 }, "milk-skim": { sealed: 90, opened: 3 },
  "milk-semi-skimmed": { sealed: 90, opened: 3 },
  "single-cream": { sealed: 90, opened: 3 }, "whipping-cream": { sealed: 90, opened: 3 },
  // Tinned.
  "condensed-milk": { sealed: 365, opened: 7 }, "evaporated-milk": { sealed: 365, opened: 5 },
  butter: { sealed: 30, opened: 21 }, "butter-unsalted": { sealed: 30, opened: 21 },
  "butter-salted": { sealed: 30, opened: 21 },
  // Hard cheeses, vacuum-packed.
  parmesan: { sealed: 180, opened: 30 }, "cheddar-cheese": { sealed: 90, opened: 21 },
  gruyere: { sealed: 90, opened: 21 }, comte: { sealed: 90, opened: 21 },
  emmental: { sealed: 90, opened: 21 }, gouda: { sealed: 90, opened: 21 },
  "raclette-cheese": { sealed: 30, opened: 14 },
  "blue-cheese": { sealed: 30, opened: 14 }, feta: { sealed: 30, opened: 7 },
  // Soft and fresh cheeses.
  camembert: { sealed: 14, opened: 7 }, brie: { sealed: 14, opened: 7 },
  "goat-cheese": { sealed: 14, opened: 7 }, mozzarella: { sealed: 14, opened: 3 },
  mascarpone: { sealed: 14, opened: 3 }, ricotta: { sealed: 14, opened: 5 },
  paneer: { sealed: 14, opened: 3 }, "cream-cheese": { sealed: 21, opened: 7 },
  "cottage-cheese": { sealed: 7, opened: 5 }, "fromage-blanc": { sealed: 14, opened: 5 },
  // Yogurts and thick creams.
  "plain-yogurt": { sealed: 14, opened: 3 }, "greek-yogurt": { sealed: 14, opened: 5 },
  "flavoured-yogurt": { sealed: 14, opened: 3 }, "yogurt-fat-free": { sealed: 14, opened: 3 },
  "heavy-cream": { sealed: 14, opened: 5 }, "creme-fraiche": { sealed: 14, opened: 5 },
  "creme-fraiche-light": { sealed: 14, opened: 5 },
  "sour-cream": { sealed: 14, opened: 7 },
  // -- Eggs ----------------------------------------------------------------------------------
  // In the shell; `opened` is a cracked egg. Whites come as a chilled carton, yolks are separated
  // at home, since no shop sells them alone.
  "egg-whole": { sealed: 21, opened: 2 }, "egg-white": { sealed: 10, opened: 3 },
  "egg-yolk": { sealed: 2, opened: 2 },
  // -- Legumes -------------------------------------------------------------------------------
  // Tinned, cooked.
  "black-beans": { sealed: 730, opened: 3 }, "kidney-beans": { sealed: 730, opened: 3 },
  chickpeas: { sealed: 730, opened: 3 }, "white-beans-cannellini": { sealed: 730, opened: 3 },
  "pinto-beans": { sealed: 730, opened: 3 },
  // Dry.
  "lentils-red": { sealed: 365, opened: 365 }, "lentils-green": { sealed: 365, opened: 365 },
  "split-peas": { sealed: 365, opened: 365 }, soybeans: { sealed: 365, opened: 365 },
  "chickpea-flour": { sealed: 365, opened: 180 },
  // Frozen.
  edamame: { sealed: 240, opened: 90 },
  // -- Nuts and seeds ------------------------------------------------------------------------
  almonds: { sealed: 180, opened: 90 }, "almonds-flaked": { sealed: 180, opened: 90 },
  cashews: { sealed: 180, opened: 90 }, pistachios: { sealed: 180, opened: 90 },
  peanuts: { sealed: 180, opened: 90 }, hazelnuts: { sealed: 180, opened: 90 },
  macadamia: { sealed: 180, opened: 90 }, "brazil-nuts": { sealed: 180, opened: 60 },
  // The oiliest nuts, which go rancid first.
  walnuts: { sealed: 90, opened: 30 }, pecans: { sealed: 90, opened: 30 },
  "pine-nuts": { sealed: 90, opened: 30 },
  "chia-seeds": { sealed: 730, opened: 365 }, "flax-seeds": { sealed: 365, opened: 180 },
  "sesame-seeds": { sealed: 365, opened: 180 }, "poppy-seeds": { sealed: 365, opened: 180 },
  "hemp-seeds": { sealed: 365, opened: 90 }, "sunflower-seeds": { sealed: 180, opened: 90 },
  "pumpkin-seeds": { sealed: 180, opened: 90 },
  // -- Fresh herbs ---------------------------------------------------------------------------
  basil: { sealed: 5, opened: 3 }, parsley: { sealed: 7, opened: 5 },
  cilantro: { sealed: 7, opened: 3 }, mint: { sealed: 7, opened: 3 },
  dill: { sealed: 7, opened: 3 }, chives: { sealed: 7, opened: 3 },
  tarragon: { sealed: 7, opened: 3 }, sage: { sealed: 7, opened: 5 },
  "oregano-fresh": { sealed: 7, opened: 5 }, thyme: { sealed: 10, opened: 7 },
  rosemary: { sealed: 14, opened: 7 }, lemongrass: { sealed: 14, opened: 7 },
  "curry-leaves": { sealed: 14, opened: 7 }, "bouquet-garni": { sealed: 7, opened: 5 },
  // -- Spices and dried herbs: two years sealed, one once opened, whatever the spice --------
  "black-pepper": { sealed: 730, opened: 365 }, cinnamon: { sealed: 730, opened: 365 },
  cumin: { sealed: 730, opened: 365 }, paprika: { sealed: 730, opened: 365 },
  "paprika-smoked": { sealed: 730, opened: 365 }, turmeric: { sealed: 730, opened: 365 },
  "ginger-ground": { sealed: 730, opened: 365 }, nutmeg: { sealed: 730, opened: 365 },
  "chili-powder": { sealed: 730, opened: 365 }, "cayenne-pepper": { sealed: 730, opened: 365 },
  "espelette-pepper": { sealed: 730, opened: 365 }, "garam-masala": { sealed: 730, opened: 365 },
  "curry-powder": { sealed: 730, opened: 365 }, "ras-el-hanout": { sealed: 730, opened: 365 },
  saffron: { sealed: 730, opened: 365 }, "coriander-ground": { sealed: 730, opened: 365 },
  "mustard-seeds": { sealed: 730, opened: 365 }, cloves: { sealed: 730, opened: 365 },
  cardamom: { sealed: 730, opened: 365 }, "herbes-de-provence": { sealed: 730, opened: 365 },
  "dried-oregano": { sealed: 730, opened: 365 }, "dried-basil": { sealed: 730, opened: 365 },
  "bay-leaf": { sealed: 730, opened: 365 },
  "dried-thyme": { sealed: 730, opened: 365 }, "dried-rosemary": { sealed: 730, opened: 365 },
  "dried-parsley": { sealed: 730, opened: 365 }, "dried-sage": { sealed: 730, opened: 365 },
  "dried-dill": { sealed: 730, opened: 365 }, "dried-mint": { sealed: 730, opened: 365 },
  "dried-chives": { sealed: 730, opened: 365 }, "dried-tarragon": { sealed: 730, opened: 365 },
  "garlic-powder": { sealed: 730, opened: 365 }, "onion-powder": { sealed: 730, opened: 365 },
  "chili-flakes": { sealed: 730, opened: 365 }, "cinnamon-stick": { sealed: 730, opened: 365 },
  "white-pepper": { sealed: 730, opened: 365 }, "mustard-powder": { sealed: 730, opened: 365 },
  allspice: { sealed: 730, opened: 365 }, "quatre-epices": { sealed: 730, opened: 365 },
  "star-anise": { sealed: 730, opened: 365 }, "coriander-seeds": { sealed: 730, opened: 365 },
  // -- Oils ----------------------------------------------------------------------------------
  "olive-oil": { sealed: 540, opened: 90 }, "coconut-oil": { sealed: 540, opened: 365 },
  "vegetable-oil": { sealed: 365, opened: 180 }, "canola-oil": { sealed: 365, opened: 180 },
  "sunflower-oil": { sealed: 365, opened: 180 }, "sesame-oil": { sealed: 365, opened: 180 },
  "peanut-oil": { sealed: 365, opened: 180 },
  // A nut oil turns rancid within months of opening, as `walnuts` does.
  "hazelnut-oil": { sealed: 365, opened: 90 },
  ghee: { sealed: 270, opened: 90 },
  // -- Condiments ----------------------------------------------------------------------------
  // Keeps indefinitely; ten years stands in for "never".
  salt: { sealed: 3650, opened: 3650 },
  "vinegar-white": { sealed: 730, opened: 730 }, "vinegar-red-wine": { sealed: 730, opened: 730 },
  "balsamic-vinegar": { sealed: 730, opened: 730 }, "rice-vinegar": { sealed: 730, opened: 730 },
  "cider-vinegar": { sealed: 730, opened: 730 }, "white-wine-vinegar": { sealed: 730, opened: 730 },
  "sherry-vinegar": { sealed: 730, opened: 730 },
  "soy-sauce": { sealed: 730, opened: 365 }, "fish-sauce": { sealed: 730, opened: 365 },
  "soy-sauce-reduced-salt": { sealed: 730, opened: 365 }, tamari: { sealed: 730, opened: 365 },
  mirin: { sealed: 730, opened: 180 }, sriracha: { sealed: 365, opened: 180 },
  "sweet-chili-sauce": { sealed: 365, opened: 180 }, "mango-chutney": { sealed: 365, opened: 90 },
  "tamarind-paste": { sealed: 365, opened: 90 }, "curry-paste-green": { sealed: 365, opened: 30 },
  "worcestershire-sauce": { sealed: 730, opened: 365 },
  ketchup: { sealed: 365, opened: 180 }, "mustard-yellow": { sealed: 365, opened: 180 },
  "mustard-wholegrain": { sealed: 365, opened: 180 }, "hot-sauce": { sealed: 365, opened: 180 },
  "oyster-sauce": { sealed: 365, opened: 180 }, "hoisin-sauce": { sealed: 365, opened: 180 },
  "miso-paste": { sealed: 365, opened: 180 }, mayonnaise: { sealed: 90, opened: 60 },
  tahini: { sealed: 365, opened: 90 }, "preserved-lemon": { sealed: 365, opened: 90 },
  harissa: { sealed: 365, opened: 30 }, "curry-paste-red": { sealed: 365, opened: 30 },
  // A jar kept in the cupboard, and a tin of concentrate.
  pesto: { sealed: 365, opened: 7 }, "tomato-paste": { sealed: 365, opened: 5 },
  // Chilled.
  hummus: { sealed: 14, opened: 5 },
  // -- Sweeteners ----------------------------------------------------------------------------
  "white-sugar": { sealed: 3650, opened: 3650 }, "powdered-sugar": { sealed: 730, opened: 730 },
  "brown-sugar": { sealed: 730, opened: 365 }, "vanilla-sugar": { sealed: 730, opened: 365 },
  honey: { sealed: 730, opened: 730 }, "agave-syrup": { sealed: 730, opened: 365 },
  "palm-sugar": { sealed: 730, opened: 365 },
  "maple-syrup": { sealed: 365, opened: 180 },
  // -- Everything else -----------------------------------------------------------------------
  water: { sealed: 365, opened: 3 },
  // Liquid, in a carton; and dry cubes.
  "vegetable-broth": { sealed: 365, opened: 3 }, "chicken-broth": { sealed: 365, opened: 3 },
  "beef-broth": { sealed: 365, opened: 3 }, "bouillon-cube": { sealed: 365, opened: 365 },
  "vegetable-stock-cube": { sealed: 365, opened: 365 }, "veal-stock-powder": { sealed: 365, opened: 180 },
  // Shelf-stable cartons.
  "soy-milk": { sealed: 180, opened: 7 }, "almond-milk": { sealed: 180, opened: 7 },
  "oat-milk": { sealed: 180, opened: 7 },
  "orange-juice": { sealed: 180, opened: 5 }, "apple-juice": { sealed: 180, opened: 5 },
  // Chilled.
  "tofu-silken": { sealed: 30, opened: 3 }, "tofu-firm": { sealed: 30, opened: 3 },
  tempeh: { sealed: 10, opened: 3 }, seitan: { sealed: 14, opened: 3 },
  // Tins, jars and bottles.
  "canned-tomatoes": { sealed: 365, opened: 5 }, passata: { sealed: 365, opened: 5 },
  "tomato-sauce": { sealed: 365, opened: 5 }, "coconut-milk": { sealed: 730, opened: 3 },
  "coconut-milk-light": { sealed: 730, opened: 3 },
  "olives-green": { sealed: 365, opened: 14 }, "olives-black": { sealed: 365, opened: 14 },
  capers: { sealed: 365, opened: 90 }, pickles: { sealed: 365, opened: 30 },
  // Wine is ordinary table wine, corked back and kept in the fridge once opened.
  "white-wine": { sealed: 365, opened: 3 }, "red-wine": { sealed: 730, opened: 3 },
  beer: { sealed: 180, opened: 1 },
  "coffee-ground": { sealed: 180, opened: 30 }, "black-tea": { sealed: 365, opened: 180 },
  // The pantry.
  nori: { sealed: 365, opened: 90 }, "orange-blossom-water": { sealed: 730, opened: 180 },
  "baking-powder": { sealed: 365, opened: 180 }, "baking-soda": { sealed: 730, opened: 365 },
  "dry-yeast": { sealed: 365, opened: 120 }, gelatin: { sealed: 730, opened: 365 },
  "dark-chocolate": { sealed: 365, opened: 180 }, "milk-chocolate": { sealed: 180, opened: 90 },
  "cocoa-powder": { sealed: 730, opened: 365 }, "vanilla-extract": { sealed: 730, opened: 730 },
  "peanut-butter": { sealed: 180, opened: 60 }, "nutritional-yeast": { sealed: 730, opened: 365 },
};

/**
 * -------------------------------------------------------------------------------------------
 *  DIET AND ALLERGENS
 * -------------------------------------------------------------------------------------------
 *
 * **What these two sections model, and what they deliberately do not.** They describe the GENERIC
 * ingredient as it is normally sold - the thing a recipe means when it writes "parmesan" or "white
 * wine". Processing aids that vary from producer to producer are out of scope and are not guessed
 * at: the rennet in a hard cheese (calf in a PDO Parmigiano, microbial in most supermarket grated
 * parmesan) and the fining agent in a wine or beer (isinglass, gelatin, or neither) cannot be read
 * off a category or a name.
 *
 * Allergen coverage runs to the EU-14 as they would appear on the packet. It is deepest where a tag
 * reads it (gluten, milk, nuts, peanuts) and thinnest where nothing does yet.
 *
 * @limitation Because a processing aid cannot be read off a category or a name, `parmesan` is
 * `vegetarian` and `white-wine` is `vegan`. That is a real limitation and it is written down
 * rather than papered over. Whoever wants to close it closes it by splitting the row - a
 * `parmigiano-reggiano` distinct from `parmesan` - not by making this file hedge, because a hedge
 * here silently strips `vegetarian` from every pasta dish in the catalog.
 *
 * @limitation Cured meats commonly declare sulphites and are recorded as carrying none. Fine for
 * the tags that exist, and the first thing to fix if `sulphite-free` is ever wanted.
 */

/**
 * The diet a category settles on its own; the exceptions are named in `DIET` below.
 *
 * `CONDIMENT`, `SWEETENER` and `OTHER` are **deliberately absent**, and their absence is the whole
 * point of this map. Those three are where an ingredient's category tells you nothing about what it
 * contains: fish sauce is a condiment, honey is a sweetener, gelatin and beef broth are "other".
 * A default for them would be a permissive guess, and a permissive guess is what makes a pad thai
 * vegetarian. So every row in one of those categories must declare itself in `DIET`, and
 * `seedIngredients` throws naming the slug when one does not.
 *
 * The throw is the mechanism, not a nicety. A missing entry is otherwise invisible - the row seeds,
 * the recipe tags, and nothing looks wrong until someone with a diet reads a label we wrote.
 */
const DIET_BY_CATEGORY: Partial<Record<Category, Diet>> = {
  VEGETABLE: "vegan", FRUIT: "vegan", GRAIN: "vegan", LEGUME: "vegan", NUT: "vegan",
  SEED: "vegan", HERB: "vegan", SPICE: "vegan", OIL: "vegan",
  MEAT: "omnivore", SEAFOOD: "pescatarian", DAIRY: "vegetarian", EGG: "vegetarian",
};

/**
 * The diet per slug - every row whose category has no default, plus the exceptions to the ones
 * that do. Wins over `DIET_BY_CATEGORY`.
 *
 * The comment on each group is the reason that group is here rather than covered by a default.
 */
const DIET: Record<string, Diet> = {
  // -- Grains that are not plants all the way down ------------------------------------------
  // Egg in the pasta, butter in the pastry, honey in the granola.
  "fresh-tagliatelle": "vegetarian", "egg-noodles": "vegetarian", "puff-pastry": "vegetarian",
  "shortcrust-pastry": "vegetarian", granola: "vegetarian",
  // Yogurt or milk in the naan and the bun, egg in the gnocchi on most French shelves.
  naan: "vegetarian", "burger-bun": "vegetarian", gnocchi: "vegetarian",

  // -- Condiments: the category proves nothing -----------------------------------------------
  // Worcestershire is anchovy and mayonnaise is egg; neither is legible from "CONDIMENT".
  salt: "vegan", "soy-sauce": "vegan", ketchup: "vegan", "mustard-yellow": "vegan",
  "vinegar-white": "vegan", "balsamic-vinegar": "vegan", "hot-sauce": "vegan",
  "tomato-paste": "vegan", mayonnaise: "vegetarian", "worcestershire-sauce": "pescatarian",
  harissa: "vegan", hummus: "vegan", "vinegar-red-wine": "vegan", tahini: "vegan",
  "mustard-wholegrain": "vegan",
  // The row `DIET_BY_CATEGORY` names as its reason for existing: anchovy, filed under CONDIMENT.
  "fish-sauce": "pescatarian",
  "rice-vinegar": "vegan", "hoisin-sauce": "vegan", "miso-paste": "vegan",
  "preserved-lemon": "vegan",
  // Both read as a plant sauce and are not one: oyster sauce is oyster extract, and Thai red curry
  // paste is built on shrimp paste in every jar not explicitly labelled otherwise.
  "oyster-sauce": "pescatarian", "curry-paste-red": "pescatarian", "curry-paste-green": "pescatarian",
  "soy-sauce-reduced-salt": "vegan", tamari: "vegan", "cider-vinegar": "vegan",
  "white-wine-vinegar": "vegan", "sherry-vinegar": "vegan", "tamarind-paste": "vegan",
  sriracha: "vegan", mirin: "vegan", "sweet-chili-sauce": "vegan", "mango-chutney": "vegan",
  // Parmesan in the jar, in every recipe and on every label that calls itself pesto.
  pesto: "vegetarian",

  // -- Sweeteners: honey is the whole reason this category has no default --------------------
  "white-sugar": "vegan", "brown-sugar": "vegan", "powdered-sugar": "vegan",
  "maple-syrup": "vegan", "agave-syrup": "vegan", "vanilla-sugar": "vegan", "palm-sugar": "vegan",
  honey: "vegetarian",

  // -- Other: a bucket by definition, so every row states its own case -----------------------
  water: "vegan", "vegetable-broth": "vegan", "tofu-firm": "vegan", tempeh: "vegan",
  seitan: "vegan", "baking-powder": "vegan", "baking-soda": "vegan", "dry-yeast": "vegan",
  // The one OIL row that is not a plant oil: ghee is butter with the milk solids cooked out.
  ghee: "vegetarian",
  "dark-chocolate": "vegan", "cocoa-powder": "vegan", "vanilla-extract": "vegan",
  "peanut-butter": "vegan", "coconut-milk": "vegan", "almond-milk": "vegan", "oat-milk": "vegan",
  "canned-tomatoes": "vegan", passata: "vegan", "tomato-sauce": "vegan", "olives-green": "vegan", "olives-black": "vegan", capers: "vegan",
  "soy-milk": "vegan", "tofu-silken": "vegan", nori: "vegan", "orange-blossom-water": "vegan",
  pickles: "vegan", "coffee-ground": "vegan", "black-tea": "vegan", "orange-juice": "vegan",
  "apple-juice": "vegan", "white-wine": "vegan", "red-wine": "vegan", beer: "vegan",
  "milk-chocolate": "vegetarian", "vegetable-stock-cube": "vegan", "nutritional-yeast": "vegan",
  "coconut-milk-light": "vegan",
  // Stock from an animal, and a setting agent made of its collagen. Both read as "OTHER".
  "chicken-broth": "omnivore", "beef-broth": "omnivore", gelatin: "omnivore",
  "veal-stock-powder": "omnivore",
  // A generic cube is built on poultry or beef fat far more often than not, and the direction to
  // be wrong in is the one that does not serve a vegetarian a stock they would refuse.
  "bouillon-cube": "omnivore",
};

/**
 * The only two categories that carry an allergen mechanically, with no exception in the catalog:
 * every dairy row is milk, and both egg rows are eggs.
 *
 * Nothing else gets a baseline, and that is deliberate. `GRAIN` looks like it should - until rice,
 * quinoa, polenta and cornstarch, which are four gluten-free rows in a category a rule would have
 * called gluten. `NUT` looks like it should - until peanuts, which is a legume and a separate
 * allergen, and the one row where the rule and the truth differ is the row someone reacts to. An
 * implicit rule is how a confident false negative ships, so everything else is written out.
 */
const ALLERGENS_BY_CATEGORY: Partial<Record<Category, Allergen[]>> = {
  DAIRY: ["milk"],
  EGG: ["eggs"],
};

/**
 * Every other ingredient that carries an allergen, named one at a time. Merged with the category
 * baseline above rather than replacing it, so a dairy row here ADDS to `milk` instead of erasing it.
 *
 * A slug absent from this map carries no allergen - and because `seedIngredients` writes
 * `allergens` on every row, `[]` included, that absence is a positive claim rather than a gap. It
 * is the difference between the `[]` stored here and the `undefined` of a row nothing has
 * classified, which is the only thing `computeTags` will refuse to answer from.
 * Adding a row to `ROWS` without considering this map is therefore an assertion that it is free of
 * all fourteen. That is the one thing to remember about this file.
 */
const ALLERGENS_BY_SLUG: Record<string, Allergen[]> = {
  // -- Cereals containing gluten -------------------------------------------------------------
  // Wheat, barley and oats. Absent, and not by accident: rice, corn and quinoa in every form -
  // white/brown/arborio/basmati rice, rice-noodles, cornmeal, polenta, cornstarch, quinoa.
  // Oats are on the EU list in their own right, so `oats` and anything oat-based counts.
  "pasta-dry": ["gluten"], "whole-wheat-pasta": ["gluten"], spaghetti: ["gluten"],
  penne: ["gluten"], macaroni: ["gluten"], "lasagna-sheets": ["gluten"], couscous: ["gluten"],
  bulgur: ["gluten"],
  barley: ["gluten"], oats: ["gluten"], granola: ["gluten"],
  "flour-all-purpose": ["gluten"], "whole-wheat-flour": ["gluten"], breadcrumbs: ["gluten"],
  "bread-white": ["gluten"], "bread-whole-wheat": ["gluten"], baguette: ["gluten"],
  "tortilla-wrap": ["gluten"], "pizza-dough": ["gluten"], orzo: ["gluten"], ciabatta: ["gluten"],
  // Yogurt in the naan; milk and the sesame on top of most buns, egg in most gnocchi. Not on every
  // packet, and the direction to be wrong in is the one that withholds a free-from tag.
  naan: ["gluten", "milk"], "burger-bun": ["gluten", "milk", "sesame"], gnocchi: ["gluten", "eggs"],
  // Barley malt extract is what keeps cornflakes off a gluten-free table, despite the corn.
  "cereal-cornflakes": ["gluten"],
  // Egg in the dough, butter in the pastry.
  "fresh-tagliatelle": ["gluten", "eggs"], "egg-noodles": ["gluten", "eggs"],
  "puff-pastry": ["gluten", "milk"], "shortcrust-pastry": ["gluten", "milk"],

  // -- Fish, crustaceans and molluscs: three separate EU allergens, not one "seafood" --------
  salmon: ["fish"], "tuna-canned-water": ["fish"], cod: ["fish"], tilapia: ["fish"],
  sardines: ["fish"], trout: ["fish"], mackerel: ["fish"], anchovy: ["fish"],
  "salmon-smoked": ["fish"], haddock: ["fish"], pollock: ["fish"],
  // Anchovy, fermented — the sauce the DIET map above also singles out.
  "fish-sauce": ["fish"],
  shrimp: ["crustaceans"], crab: ["crustaceans"],
  mussels: ["molluscs"], scallops: ["molluscs"], squid: ["molluscs"],
  "oyster-sauce": ["molluscs"], "curry-paste-red": ["crustaceans"], "curry-paste-green": ["crustaceans"],

  // -- Tree nuts, and the rows that are not tree nuts ----------------------------------------
  almonds: ["nuts"], "almonds-flaked": ["nuts"], walnuts: ["nuts"], cashews: ["nuts"],
  pistachios: ["nuts"],
  pecans: ["nuts"], hazelnuts: ["nuts"], macadamia: ["nuts"], "brazil-nuts": ["nuts"],
  "almond-milk": ["nuts"],
  // A cold-pressed nut oil keeps the protein a refined one loses, and is sold cold-pressed.
  "hazelnut-oil": ["nuts"],
  // A pine nut is a seed and is not on the EU-14, but it is sold, stored and reacted to as a nut.
  // Listed, because the direction to be wrong in is the one that WITHHOLDS `nut-free`.
  "pine-nuts": ["nuts"],
  // A peanut is a legume. Its own allergen, and someone allergic to tree nuts is often fine with
  // it - which is why `nut-free` withholds on either and the two are still recorded apart.
  peanuts: ["peanuts"], "peanut-butter": ["peanuts"], "peanut-oil": ["peanuts"],
  // Coconut is not an EU-14 nut: `coconut-fresh` and `coconut-milk` deliberately carry nothing.

  // -- Soy, sesame, celery, mustard ----------------------------------------------------------
  soybeans: ["soybeans"], edamame: ["soybeans"], "tofu-firm": ["soybeans"], tempeh: ["soybeans"],
  "sesame-seeds": ["sesame"], "sesame-oil": ["sesame"],
  // Tahini is what makes hummus sesame, and it is in every recipe for it.
  hummus: ["sesame"], tahini: ["sesame"],
  celery: ["celery"],
  // Stock, in a cube or a carton, is built on celery almost without exception.
  "vegetable-broth": ["celery"], "chicken-broth": ["celery"], "beef-broth": ["celery"],
  "bouillon-cube": ["celery"], "vegetable-stock-cube": ["celery"],
  // Wheat flour thickens a fond, and celery flavours it.
  "veal-stock-powder": ["celery", "gluten"],
  "mustard-yellow": ["mustard"], "mustard-wholegrain": ["mustard"], "mustard-seeds": ["mustard"],
  "mustard-powder": ["mustard"],

  // -- Everything else -----------------------------------------------------------------------
  // Brewed from wheat, and fermented from soy. Tamari is the one brewed without the wheat.
  "soy-sauce": ["gluten", "soybeans"], "soy-sauce-reduced-salt": ["gluten", "soybeans"],
  tamari: ["soybeans"],
  // Anchovy, malt vinegar and soy - the sauce that is three allergens and reads as none.
  "worcestershire-sauce": ["fish", "gluten", "soybeans"],
  mayonnaise: ["eggs"],
  // Parmesan and pine nuts — see `pine-nuts` above for why a pine nut is recorded as a tree nut.
  pesto: ["milk", "nuts"],
  seitan: ["gluten"], "oat-milk": ["gluten"], "soy-milk": ["soybeans"],
  "tofu-silken": ["soybeans"], "bean-sprouts": ["soybeans"], "miso-paste": ["soybeans"],
  "hoisin-sauce": ["gluten", "soybeans"],
  // Clarified, but not milk-free: ghee retains trace casein and is declared as milk.
  ghee: ["milk"],
  // Lecithin in the chocolate, milk in the milk chocolate. Cocoa powder alone carries neither.
  "dark-chocolate": ["soybeans"], "milk-chocolate": ["milk", "soybeans"],
  // Preserved with sulphur dioxide, and declared as such on every bottle.
  "white-wine": ["sulphites"], "red-wine": ["sulphites"], "balsamic-vinegar": ["sulphites"],
  "vinegar-red-wine": ["sulphites"], "white-wine-vinegar": ["sulphites"],
  "sherry-vinegar": ["sulphites"], "cider-vinegar": ["sulphites"],
  // Sodium bisulphite, on the bottle that named the sauce.
  sriracha: ["sulphites"],
  beer: ["gluten", "sulphites"],
};

/**
 * A name that already says its form, or is a whole part rather than the spice itself.
 *
 * The whole parts include a stick, a flake, a star and a tied bundle: the spice sold uncut and the
 * herbs sold tied. Their row is not the ground spice, so without the word here `_formsSoldAs`
 * would give a cinnamon stick "bâton de cannelle en poudre", and the matcher, which reads a form
 * word as identity, would file the whole stick as a powder.
 *
 * Keyed by `Locale`, like `FORM_SPELLINGS`, so a new language cannot be forgotten here either.
 */
const _NAMES_A_FORM: Record<Locale, RegExp> = {
  fr: /poudre|moulu|s[ée]ch|graine|feuille|b[âa]ton|flocon|[ée]toil|bouquet/i,
  // `\bstar\b` and not `star`, which is inside "mustard".
  en: /powder|ground|dried|seed|leaf|stick|flake|\bstar\b|bouquet/i,
};

/**
 * How each language writes the form a row is sold in, or the part of it a recipe counts, around
 * its name. A herb's leaves are not a form: they are the herb, and "feuilles de basilic" names the
 * row. But `feuille` is a word of the name since it also names a curry leaf, so the row needs the
 * spelling.
 *
 * One spelling per form is enough: the matcher maps "moulue", "powder" and "ground" to one form, and
 * "séchées", "sèches" and "dried" to another. "Secs" is the exception, since `sec` is no form word
 * ("vin sec" is a dry wine), so the plural a recipe writes for pulses is spelled out.
 *
 * Keyed by `Locale`: a language added to `SUPPORTED_LOCALES` fails typecheck here until it says how
 * it writes these, rather than seeding its spices without the spelling every recipe uses.
 */
const FORM_SPELLINGS: Record<Locale, Record<"ground" | "dried" | "leaves", (name: string) => string[]>> = {
  fr: {
    ground: (name) => [`${name} en poudre`],
    dried: (name) => [`${name} séchés`, `${name} secs`],
    leaves: (name) => [`feuilles ${/^[aeiouyhâéèêîôû]/.test(name) ? "d'" : "de "}${name}`],
  },
  en: {
    ground: (name) => [`ground ${name}`],
    dried: (name) => [`dried ${name}`],
    leaves: (name) => [`${name} leaves`],
  },
};

/**
 * Staples whose row IS the dry product: their figures are the dry ones (330 to 390 kcal), as a shop
 * sells them. Chickpeas and the beans are NOT here, and that is the rule rather than an oversight:
 * their rows carry the cooked, tinned figures (127 to 164 kcal), so "pois chiches secs" is another
 * product, two to three times as dense, and must not land on them.
 */
const SOLD_DRY = new Set([
  "white-rice", "brown-rice", "basmati-rice", "arborio-rice", "jasmine-rice", "orzo", "pasta-dry", "whole-wheat-pasta",
  "spaghetti", "penne", "macaroni", "rice-noodles", "egg-noodles", "quinoa", "couscous", "barley",
  "bulgur", "lentils-red", "lentils-green", "split-peas", "soybeans",
]);

/**
 * The spellings of the form a row is already sold in, generated rather than written per row.
 *
 * A spice named bare is the ground spice, and a staple named bare is the dry one: that is how a
 * recipe writes them and how a shop sells them, so the row IS that form. But a form word is identity
 * to the matcher (a powder of a fresh food is another product), so "safran en poudre" no longer folds
 * onto `Safran` by itself. Every such row needs the spelling, and a list written by hand covered ten
 * spices and silently dropped the rest to a model call, which is why the rule lives here.
 *
 * ⚠️ **Seed only, and that is the rule rather than an oversight.** It is safe here because every row
 * it reads was written and checked by hand. Moved into `ingredientRow` or `createIngredient`, it
 * would run on a category the model guessed and a name it cannot read: "Poivre en grains" would
 * answer to ground pepper, a fresh ginger filed as SPICE would take "gingembre en poudre", and
 * `SOLD_DRY`, guessed from the figures instead of listed, would make a fresh pasta over 300 kcal
 * tie with the dry one. Each is a wrong link with no error. A row a
 * shopper grows gets its form spellings from `sanitizeIngredient`'s aliases instead, where a miss
 * only costs a model call.
 */
const _formsSoldAs = (slug: string, category: Category, names: Record<Locale, string>): CatalogEntry["aliases"] => {
  const namesAForm = SUPPORTED_LOCALES.some((locale) => _NAMES_A_FORM[locale].test(names[locale]));
  const form =
    category === "SPICE" && !namesAForm ? "ground"
    : category === "HERB" && !namesAForm ? "leaves"
    : SOLD_DRY.has(slug) ? "dried"
    : undefined;
  if (!form) return {};

  return Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, FORM_SPELLINGS[locale][form](names[locale].toLowerCase())]),
  );
};

const _mergeAliases = (...lists: CatalogEntry["aliases"][]): CatalogEntry["aliases"] =>
  Object.fromEntries(
    SUPPORTED_LOCALES
      .map((locale) => [locale, [...new Set(lists.flatMap((list) => list[locale] ?? []))]] as const)
      .filter(([, words]) => words.length > 0),
  );

export const CATALOG: readonly CatalogEntry[] = ROWS.map(
  ([
    slug, en, fr, category, defaultUnit, defaultQuantity,
    calories, protein, fat, saturatedFat, carbohydrates, sugars, fiber, sodium,
  ]) => ({
    slug,
    en,
    fr,
    emoji: EMOJI[slug] ?? CATEGORY_EMOJI[category],
    aliases: _mergeAliases(ALIASES[slug] ?? {}, _formsSoldAs(slug, category, { fr, en })),
    category,
    diet: DIET[slug] ?? DIET_BY_CATEGORY[category],
    // Sorted and de-duplicated through the shared helper, so the stored column is canonical
    // whatever order the two maps happened to contribute in.
    allergens: sortAllergens([
      ...(ALLERGENS_BY_CATEGORY[category] ?? []),
      ...(ALLERGENS_BY_SLUG[slug] ?? []),
    ]),
    defaultUnit,
    defaultQuantity,
    // Passed through even when absent, so the seed's `patch` clears a ratio a row used to carry.
    gramsPerPiece: GRAMS_PER_PIECE[slug],
    gramsPerSlice: GRAMS_PER_SLICE[slug],
    gramsPerMl: GRAMS_PER_ML[slug],
    edibleShare: EDIBLE_SHARE[slug],
    shelfLifeDays: SHELF_LIFE_DAYS[slug]?.sealed,
    openedShelfLifeDays: SHELF_LIFE_DAYS[slug]?.opened,
    nutrition: { calories, protein, fat, saturatedFat, carbohydrates, sugars, fiber, sodium },
  }),
);
