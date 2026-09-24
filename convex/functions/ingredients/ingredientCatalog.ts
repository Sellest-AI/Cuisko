import type { Category } from "@shared/categories";
import type { Unit } from "@shared/ingredients";
import { sortAllergens, type Allergen } from "@shared/allergens";
import type { Diet } from "@shared/diets";

/**
 * The starter ingredient catalog `seedIngredients.ts` writes to the database.
 *
 * Values are per 100g/100ml, compiled by hand from public nutrition references (USDA FoodData
 * Central and CIQUAL) rather than fetched live — there is no single free API that returns clean
 * generic-ingredient nutrition AND a matching French name, so a live fetch would still need this
 * much curation on top. `defaultUnit`/`defaultQuantity` are a starting point for "how much of this
 * does a household usually buy at once", not a measured fact — edit freely.
 *
 * One row per tuple keeps ~200 entries reviewable; `CATALOG` below is what the rest of the code
 * actually consumes.
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
  aliases: { fr?: string[]; en?: string[] };
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
  ["clementine", "Clementine", "Clémentine", "FRUIT", "pcs", 6, 47, 0.9, 0.2, 0, 12, 9, 1.7, 1],
  ["raisins-dried", "Raisins", "Raisins secs", "FRUIT", "g", 200, 299, 3.1, 0.5, 0.1, 79, 59, 3.7, 11],
  ["prunes-dried", "Prunes", "Pruneaux", "FRUIT", "g", 250, 240, 2.2, 0.4, 0, 64, 38, 7.1, 2],
  ["grapefruit", "Grapefruit", "Pamplemousse", "FRUIT", "pcs", 1, 42, 0.8, 0.1, 0, 11, 7, 1.6, 0],
  ["avocado", "Avocado", "Avocat", "FRUIT", "pcs", 1, 160, 2, 15, 2.1, 9, 0.7, 7, 7],
  ["coconut-fresh", "Coconut", "Noix de coco", "FRUIT", "g", 200, 354, 3.3, 33, 29.7, 15, 6.2, 9, 20],

  // ── Grains ──────────────────────────────────────────────────────────────────────────────
  ["white-rice", "White rice", "Riz blanc", "GRAIN", "g", 500, 130, 2.7, 0.3, 0.1, 28, 0.1, 0.4, 1],
  ["brown-rice", "Brown rice", "Riz complet", "GRAIN", "g", 500, 123, 2.6, 1, 0.2, 26, 0.4, 1.6, 4],
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
  ["fresh-tagliatelle", "Fresh tagliatelle", "Tagliatelles fraîches", "GRAIN", "g", 250, 288, 11, 2.7, 0.7, 55, 2.2, 2.5, 20],
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

  // ── Meat ────────────────────────────────────────────────────────────────────────────────
  ["chicken-breast", "Chicken breast", "Blanc de poulet", "MEAT", "g", 400, 165, 31, 3.6, 1, 0, 0, 0, 74],
  ["chicken-thigh", "Chicken thigh", "Cuisse de poulet", "MEAT", "g", 400, 209, 26, 10.9, 3.1, 0, 0, 0, 90],
  ["ground-beef-80-20", "Ground beef (80/20)", "Bœuf haché (80/20)", "MEAT", "g", 500, 254, 17, 20, 7.8, 0, 0, 0, 66],
  ["beef-steak-sirloin", "Sirloin steak", "Bavette de bœuf", "MEAT", "g", 300, 183, 27, 7.4, 2.9, 0, 0, 0, 56],
  ["pork-chop", "Pork chop", "Côte de porc", "MEAT", "g", 300, 231, 25, 14, 5, 0, 0, 0, 62],
  ["pork-loin", "Pork loin", "Filet mignon de porc", "MEAT", "g", 400, 143, 26, 3.5, 1.2, 0, 0, 0, 54],
  ["bacon", "Bacon", "Lard fumé", "MEAT", "g", 200, 541, 37, 42, 14, 1.4, 0, 0, 1717],
  ["ham", "Ham", "Jambon", "MEAT", "g", 150, 145, 21, 5.5, 1.8, 1.5, 1.4, 0, 1203],
  ["ground-turkey", "Ground turkey", "Dinde hachée", "MEAT", "g", 500, 189, 20, 12, 3.2, 0, 0, 0, 79],
  ["turkey-breast", "Turkey breast", "Blanc de dinde", "MEAT", "g", 400, 135, 30, 1, 0.3, 0, 0, 0, 55],
  ["lamb", "Lamb", "Agneau", "MEAT", "g", 400, 294, 25, 21, 9, 0, 0, 0, 72],
  ["duck-breast", "Duck breast", "Magret de canard", "MEAT", "g", 300, 337, 19, 28, 9.7, 0, 0, 0, 74],
  ["sausage-pork", "Pork sausage", "Saucisse de porc", "MEAT", "g", 300, 296, 12, 27, 9.5, 2, 0, 0, 850],
  ["veal", "Veal", "Veau", "MEAT", "g", 400, 172, 26, 7, 2.7, 0, 0, 0, 88],
  ["beef-ground-90-10", "Lean ground beef (90/10)", "Bœuf haché maigre (90/10)", "MEAT", "g", 500, 176, 20, 10, 4, 0, 0, 0, 66],
  ["chicken-slices", "Sliced cooked chicken", "Blanc de poulet en tranches", "MEAT", "pcs", 4, 111, 21, 2.5, 0.7, 1.2, 0.6, 0, 900],
  ["turkey-slices", "Sliced cooked turkey", "Blanc de dinde en tranches", "MEAT", "pcs", 4, 104, 19, 1.8, 0.5, 2.5, 1.3, 0, 1010],
  ["prosciutto", "Prosciutto", "Jambon cru", "MEAT", "g", 100, 195, 27, 9, 3.2, 0.5, 0, 0, 2340],
  ["salami", "Salami", "Saucisson sec", "MEAT", "g", 150, 407, 22, 34, 12.6, 2.4, 0.6, 0, 1740],
  ["chorizo", "Chorizo", "Chorizo", "MEAT", "g", 150, 455, 24, 38, 14, 1.9, 0.5, 0, 1235],
  ["merguez", "Merguez", "Merguez", "MEAT", "pcs", 6, 314, 15, 28, 11, 1, 0.5, 0, 900],
  ["lardons", "Bacon lardons", "Lardons", "MEAT", "g", 200, 285, 16, 24, 9.5, 0.5, 0, 0, 1400],
  ["chicken-wings", "Chicken wings", "Ailes de poulet", "MEAT", "g", 500, 203, 30, 8.1, 2.3, 0, 0, 0, 82],
  ["rabbit", "Rabbit", "Lapin", "MEAT", "g", 500, 173, 33, 3.5, 1, 0, 0, 0, 47],
  ["beef-roast", "Beef roast", "Rôti de bœuf", "MEAT", "g", 700, 195, 27, 9, 3.5, 0, 0, 0, 55],
  ["lamb-leg", "Leg of lamb", "Gigot d'agneau", "MEAT", "g", 1500, 230, 18, 17, 7.5, 0, 0, 0, 65],
  ["pork-roast", "Pork roast", "Rôti de porc", "MEAT", "g", 1000, 190, 21, 11, 4, 0, 0, 0, 60],
  ["chicken-whole", "Whole chicken", "Poulet entier", "MEAT", "pcs", 1, 215, 18.6, 15.1, 4.3, 0, 0, 0, 70],
  ["duck-whole", "Whole duck", "Canard entier", "MEAT", "pcs", 1, 404, 11.5, 39.3, 13.2, 0, 0, 0, 59],
  ["turkey-whole", "Whole turkey", "Dinde entière", "MEAT", "pcs", 1, 160, 21.9, 7.4, 2.1, 0, 0, 0, 65],

  // ── Seafood ─────────────────────────────────────────────────────────────────────────────
  ["salmon", "Salmon", "Saumon", "SEAFOOD", "g", 300, 208, 20, 13, 3.1, 0, 0, 0, 59],
  ["tuna-canned-water", "Canned tuna (in water)", "Thon en boîte (au naturel)", "SEAFOOD", "g", 150, 116, 26, 0.8, 0.2, 0, 0, 0, 247],
  ["shrimp", "Shrimp", "Crevette", "SEAFOOD", "g", 300, 99, 24, 0.3, 0.1, 0.2, 0, 0, 111],
  ["cod", "Cod", "Cabillaud", "SEAFOOD", "g", 300, 82, 18, 0.7, 0.1, 0, 0, 0, 54],
  ["tilapia", "Tilapia", "Tilapia", "SEAFOOD", "g", 300, 96, 20, 1.7, 0.6, 0, 0, 0, 52],
  ["sardines", "Sardines", "Sardines", "SEAFOOD", "g", 150, 208, 25, 11, 1.5, 0, 0, 0, 307],
  ["mussels", "Mussels", "Moules", "SEAFOOD", "g", 500, 172, 24, 4.5, 0.9, 7.4, 0, 0, 369],
  ["scallops", "Scallops", "Noix de Saint-Jacques", "SEAFOOD", "g", 200, 88, 16.8, 0.8, 0.1, 2.4, 0, 0, 392],
  ["crab", "Crab", "Crabe", "SEAFOOD", "g", 200, 97, 19, 1.5, 0.2, 0, 0, 0, 293],
  ["trout", "Trout", "Truite", "SEAFOOD", "g", 300, 148, 20, 6.6, 1.6, 0, 0, 0, 52],
  ["mackerel", "Mackerel", "Maquereau", "SEAFOOD", "g", 300, 205, 19, 13.9, 3.3, 0, 0, 0, 90],
  ["salmon-smoked", "Smoked salmon", "Saumon fumé", "SEAFOOD", "g", 100, 117, 18.3, 4.3, 0.9, 0, 0, 0, 1880],
  ["squid", "Squid", "Calamar", "SEAFOOD", "g", 300, 92, 15.6, 1.4, 0.4, 3.1, 0, 0, 44],
  ["anchovy", "Anchovy", "Anchois", "SEAFOOD", "g", 50, 131, 20, 4.8, 1.3, 0, 0, 0, 3668],

  // ── Dairy ───────────────────────────────────────────────────────────────────────────────
  ["milk-whole", "Whole milk", "Lait entier", "DAIRY", "ml", 1000, 61, 3.2, 3.3, 1.9, 4.8, 5.1, 0, 43],
  ["milk-skim", "Skim milk", "Lait écrémé", "DAIRY", "ml", 1000, 34, 3.4, 0.1, 0.1, 5, 5.1, 0, 42],
  ["butter", "Butter", "Beurre", "DAIRY", "g", 250, 717, 0.9, 81, 51, 0.1, 0.1, 0, 11],
  ["cheddar-cheese", "Cheddar cheese", "Cheddar", "DAIRY", "g", 200, 403, 25, 33, 21, 1.3, 0.5, 0, 621],
  ["mozzarella", "Mozzarella", "Mozzarella", "DAIRY", "g", 200, 280, 28, 17, 10, 3.1, 1, 0, 627],
  ["mascarpone", "Mascarpone", "Mascarpone", "DAIRY", "g", 250, 429, 4.8, 44, 29, 4.5, 3.2, 0, 30],
  ["camembert", "Camembert", "Camembert", "DAIRY", "pcs", 1, 300, 19.8, 24.3, 15.3, 0.5, 0.5, 0, 842],
  ["raclette-cheese", "Raclette cheese", "Raclette", "DAIRY", "g", 400, 357, 23, 29, 18.5, 1.3, 0.5, 0, 700],
  ["paneer", "Paneer", "Paneer", "DAIRY", "g", 200, 321, 25, 25, 16, 3.6, 2.6, 0, 18],
  ["parmesan", "Parmesan", "Parmesan", "DAIRY", "g", 100, 431, 38, 29, 19, 4.1, 0.9, 0, 1529],
  ["cream-cheese", "Cream cheese", "Fromage à tartiner", "DAIRY", "g", 200, 342, 6, 34, 19, 4.1, 3.2, 0, 321],
  ["plain-yogurt", "Plain yogurt", "Yaourt nature", "DAIRY", "g", 500, 61, 3.5, 3.3, 2.1, 4.7, 4.7, 0, 46],
  ["greek-yogurt", "Greek yogurt", "Yaourt grec", "DAIRY", "g", 500, 59, 10, 0.4, 0.1, 3.6, 3.6, 0, 36],
  ["heavy-cream", "Heavy cream", "Crème fraîche épaisse", "DAIRY", "ml", 250, 340, 2.8, 36, 23, 2.8, 2.9, 0, 38],
  ["sour-cream", "Sour cream", "Crème aigre", "DAIRY", "g", 250, 198, 2.4, 19.7, 12.6, 4.6, 3.4, 0, 32],
  ["cottage-cheese", "Cottage cheese", "Cottage cheese", "DAIRY", "g", 250, 98, 11, 4.3, 2.7, 3.4, 2.7, 0, 364],
  ["feta", "Feta", "Feta", "DAIRY", "g", 200, 264, 14, 21, 15, 4.1, 4.1, 0, 917],
  ["brie", "Brie", "Brie", "DAIRY", "g", 200, 334, 21, 28, 17.4, 0.5, 0.5, 0, 629],
  ["ricotta", "Ricotta", "Ricotta", "DAIRY", "g", 250, 174, 11.3, 13, 8.3, 3, 0.3, 0, 84],
  ["creme-fraiche", "Crème fraîche", "Crème fraîche", "DAIRY", "g", 200, 292, 2.2, 30, 20, 3, 3, 0, 40],
  ["single-cream", "Single cream", "Crème liquide légère", "DAIRY", "ml", 250, 165, 2.9, 15, 9.8, 4, 4, 0, 45],
  ["whipping-cream", "Whipping cream", "Crème à fouetter", "DAIRY", "ml", 250, 292, 2.2, 30, 19, 3.5, 3.5, 0, 38],
  ["milk-semi-skimmed", "Semi-skimmed milk", "Lait demi-écrémé", "DAIRY", "ml", 1000, 46, 3.3, 1.6, 1, 4.8, 4.8, 0, 44],
  ["condensed-milk", "Condensed milk", "Lait concentré sucré", "DAIRY", "g", 400, 321, 7.9, 8.7, 5.5, 54, 54, 0, 127],
  ["evaporated-milk", "Evaporated milk", "Lait concentré non sucré", "DAIRY", "ml", 400, 135, 6.8, 7.6, 4.6, 10, 10, 0, 106],
  ["butter-unsalted", "Unsalted butter", "Beurre doux", "DAIRY", "g", 250, 717, 0.9, 81, 51, 0.1, 0.1, 0, 4],
  ["gruyere", "Gruyère", "Gruyère", "DAIRY", "g", 200, 413, 30, 32, 18.9, 0.4, 0.3, 0, 336],
  ["comte", "Comté", "Comté", "DAIRY", "g", 200, 417, 27, 34, 21, 1.3, 0.6, 0, 620],
  ["goat-cheese", "Goat cheese", "Fromage de chèvre", "DAIRY", "g", 150, 364, 22, 30, 21, 2.5, 2.5, 0, 415],
  ["blue-cheese", "Blue cheese", "Fromage bleu", "DAIRY", "g", 150, 353, 21, 29, 19, 2.3, 0.5, 0, 1395],
  ["emmental", "Emmental", "Emmental", "DAIRY", "g", 200, 380, 28, 30, 18, 1.4, 0.5, 0, 200],
  ["fromage-blanc", "Fromage blanc", "Fromage blanc", "DAIRY", "g", 500, 74, 8, 3.4, 2.2, 3.5, 3.5, 0, 45],
  ["flavoured-yogurt", "Fruit yogurt", "Yaourt aux fruits", "DAIRY", "pcs", 8, 95, 3.5, 2.6, 1.7, 14.5, 14, 0.3, 50],
  ["butter-salted", "Salted butter", "Beurre demi-sel", "DAIRY", "g", 250, 717, 0.9, 81, 51, 0.1, 0.1, 0, 570],

  // ── Eggs ────────────────────────────────────────────────────────────────────────────────
  ["egg-whole", "Egg", "Œuf", "EGG", "pcs", 6, 155, 13, 11, 3.3, 1.1, 1.1, 0, 124],
  ["egg-white", "Egg white", "Blanc d'œuf", "EGG", "g", 100, 52, 11, 0.2, 0, 0.7, 0.7, 0, 166],
  ["egg-yolk", "Egg yolk", "Jaune d'œuf", "EGG", "pcs", 6, 322, 15.9, 26.5, 9.6, 3.6, 0.6, 0, 48],

  // ── Legumes ─────────────────────────────────────────────────────────────────────────────
  ["black-beans", "Black beans", "Haricots noirs", "LEGUME", "g", 400, 132, 8.9, 0.5, 0.1, 24, 0.3, 8.7, 1],
  ["kidney-beans", "Kidney beans", "Haricots rouges", "LEGUME", "g", 400, 127, 8.7, 0.5, 0.1, 23, 0.3, 6.4, 1],
  ["chickpeas", "Chickpeas", "Pois chiches", "LEGUME", "g", 400, 164, 8.9, 2.6, 0.3, 27, 4.8, 7.6, 7],
  ["lentils-red", "Red lentils", "Lentilles corail", "LEGUME", "g", 400, 116, 9, 0.4, 0.1, 20, 1.8, 7.9, 2],
  ["lentils-green", "Green lentils", "Lentilles vertes", "LEGUME", "g", 400, 116, 9, 0.4, 0.1, 20, 1.8, 7.9, 2],
  ["white-beans-cannellini", "Cannellini beans", "Haricots blancs", "LEGUME", "g", 400, 139, 9.7, 0.4, 0.1, 25, 0.3, 6.3, 2],
  ["pinto-beans", "Pinto beans", "Haricots pinto", "LEGUME", "g", 400, 143, 9, 0.7, 0.1, 26, 0.3, 9, 1],
  ["split-peas", "Split peas", "Pois cassés", "LEGUME", "g", 400, 118, 8.3, 0.4, 0.1, 21, 3.8, 8.3, 2],
  ["edamame", "Edamame", "Edamame", "LEGUME", "g", 300, 121, 11, 5, 0.6, 10, 2.2, 5.2, 6],
  ["soybeans", "Soybeans", "Graines de soja", "LEGUME", "g", 300, 173, 16.6, 9, 1.3, 10, 3, 6, 15],

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
  ["oregano-fresh", "Fresh oregano", "Origan frais", "HERB", "g", 15, 265, 9, 4.3, 1.6, 69, 4.1, 42.5, 25],
  ["dill", "Dill", "Aneth", "HERB", "g", 20, 43, 3.5, 1.1, 0, 7, 0, 2.1, 61],
  ["chives", "Chives", "Ciboulette", "HERB", "g", 20, 30, 3.3, 0.7, 0.1, 4.4, 1.9, 2.5, 3],
  ["tarragon", "Tarragon", "Estragon", "HERB", "g", 20, 49, 3.4, 1.1, 0, 6.3, 0, 3.4, 62],
  ["lemongrass", "Lemongrass", "Citronnelle", "HERB", "pcs", 2, 99, 1.8, 0.5, 0.1, 25, 0, 0, 6],
  ["sage", "Sage", "Sauge", "HERB", "g", 15, 315, 10.6, 12.8, 7, 61, 1.7, 40.3, 11],

  // ── Spices ──────────────────────────────────────────────────────────────────────────────
  ["black-pepper", "Black pepper", "Poivre noir", "SPICE", "g", 50, 251, 10.4, 3.3, 1.4, 64, 0.6, 25.3, 20],
  ["cinnamon", "Cinnamon", "Cannelle", "SPICE", "g", 50, 247, 4, 1.2, 0.3, 81, 2.2, 53.1, 10],
  ["cumin", "Cumin", "Cumin", "SPICE", "g", 50, 375, 17.8, 22.3, 1.5, 44, 2.3, 10.5, 168],
  ["paprika", "Paprika", "Paprika", "SPICE", "g", 50, 282, 14.1, 13, 2.1, 54, 10.3, 34.9, 68],
  ["turmeric", "Turmeric", "Curcuma", "SPICE", "g", 50, 312, 9.7, 3.3, 1.1, 65, 3.2, 21.1, 38],
  ["ginger-ground", "Ground ginger", "Gingembre en poudre", "SPICE", "g", 50, 335, 9, 4.2, 1.1, 71, 3.4, 14.1, 27],
  ["nutmeg", "Nutmeg", "Muscade", "SPICE", "g", 30, 525, 5.8, 36, 26, 49, 28, 20.8, 16],
  ["chili-powder", "Chili powder", "Piment en poudre", "SPICE", "g", 50, 282, 13.5, 14.3, 2.6, 50, 7.2, 34.8, 1004],
  ["garam-masala", "Garam masala", "Garam masala", "SPICE", "g", 30, 379, 14, 15, 3, 45, 3, 25, 50],
  ["curry-powder", "Curry powder", "Curry en poudre", "SPICE", "g", 30, 325, 14, 14, 2.2, 56, 2.8, 53, 52],
  ["saffron", "Saffron", "Safran", "SPICE", "g", 1, 310, 11.4, 5.9, 1.6, 65, 0, 3.9, 148],
  ["herbes-de-provence", "Herbes de Provence", "Herbes de Provence", "SPICE", "g", 30, 290, 9, 6, 1.5, 50, 3, 30, 50],
  ["ras-el-hanout", "Ras el hanout", "Ras el hanout", "SPICE", "g", 30, 330, 12, 12, 2, 50, 4, 28, 100],
  ["espelette-pepper", "Espelette pepper", "Piment d'Espelette", "SPICE", "g", 30, 282, 13.5, 14.3, 2.6, 50, 7.2, 34.8, 30],
  ["paprika-smoked", "Smoked paprika", "Paprika fumé", "SPICE", "g", 50, 282, 14, 13, 2.1, 54, 10, 35, 68],
  ["mustard-seeds", "Mustard seeds", "Graines de moutarde", "SPICE", "g", 50, 508, 26, 36, 2, 28, 6.8, 12, 13],
  ["cayenne-pepper", "Cayenne pepper", "Poivre de Cayenne", "SPICE", "g", 30, 318, 12, 17.3, 3.3, 57, 10.3, 27.2, 30],
  ["coriander-ground", "Ground coriander", "Coriandre en poudre", "SPICE", "g", 30, 298, 12.4, 17.8, 1, 55, 0, 41.9, 35],
  ["cloves", "Cloves", "Clou de girofle", "SPICE", "g", 20, 274, 6, 13, 4.1, 65, 2.4, 33.9, 277],
  ["cardamom", "Cardamom", "Cardamome", "SPICE", "g", 20, 311, 10.8, 6.7, 0.5, 68, 0, 28, 18],
  ["dried-oregano", "Dried oregano", "Origan séché", "SPICE", "g", 30, 265, 9, 4.3, 1.6, 69, 4.1, 42.5, 25],
  ["dried-basil", "Dried basil", "Basilic séché", "SPICE", "g", 30, 233, 23, 4, 2, 50, 0, 37.7, 26],
  ["bay-leaf", "Bay leaf", "Feuille de laurier", "SPICE", "g", 15, 313, 7.6, 8.4, 2.3, 75, 0, 26.3, 23],

  // ── Oils ────────────────────────────────────────────────────────────────────────────────
  ["olive-oil", "Olive oil", "Huile d'olive", "OIL", "ml", 500, 884, 0, 100, 13.8, 0, 0, 0, 2],
  ["vegetable-oil", "Vegetable oil", "Huile végétale", "OIL", "ml", 1000, 884, 0, 100, 13, 0, 0, 0, 0],
  ["ghee", "Ghee", "Ghee", "OIL", "g", 250, 876, 0.3, 99.5, 62, 0, 0, 0, 2],
  ["coconut-oil", "Coconut oil", "Huile de coco", "OIL", "ml", 500, 862, 0, 100, 87, 0, 0, 0, 0],
  ["sesame-oil", "Sesame oil", "Huile de sésame", "OIL", "ml", 250, 884, 0, 100, 14.2, 0, 0, 0, 0],
  ["canola-oil", "Canola oil", "Huile de colza", "OIL", "ml", 1000, 884, 0, 100, 7.4, 0, 0, 0, 0],
  ["sunflower-oil", "Sunflower oil", "Huile de tournesol", "OIL", "ml", 1000, 884, 0, 100, 10.3, 0, 0, 0, 0],

  // ── Condiments ──────────────────────────────────────────────────────────────────────────
  ["salt", "Salt", "Sel", "CONDIMENT", "g", 500, 0, 0, 0, 0, 0, 0, 0, 38758],
  ["soy-sauce", "Soy sauce", "Sauce soja", "CONDIMENT", "ml", 250, 53, 8, 0.6, 0.1, 4.9, 0.4, 0.8, 5493],
  ["ketchup", "Ketchup", "Ketchup", "CONDIMENT", "g", 500, 101, 1.2, 0.2, 0, 26, 21, 0.4, 1110],
  ["mustard-yellow", "Yellow mustard", "Moutarde", "CONDIMENT", "g", 250, 66, 4.4, 4, 0.2, 5.8, 3, 3.3, 1135],
  ["mayonnaise", "Mayonnaise", "Mayonnaise", "CONDIMENT", "g", 250, 680, 1, 75, 12, 1, 1, 0, 635],
  ["vinegar-white", "White vinegar", "Vinaigre blanc", "CONDIMENT", "ml", 500, 18, 0, 0, 0, 0.4, 0.1, 0, 2],
  ["balsamic-vinegar", "Balsamic vinegar", "Vinaigre balsamique", "CONDIMENT", "ml", 250, 88, 0.5, 0, 0, 17, 15, 0, 23],
  ["hot-sauce", "Hot sauce", "Sauce piquante", "CONDIMENT", "ml", 150, 11, 0.5, 0.4, 0.1, 1.6, 0.8, 0.3, 2400],
  ["harissa", "Harissa", "Harissa", "CONDIMENT", "g", 100, 72, 2.9, 1, 0.5, 11, 6.9, 2.5, 680],
  ["vinegar-red-wine", "Red wine vinegar", "Vinaigre de vin rouge", "CONDIMENT", "ml", 500, 19, 0, 0, 0, 0.3, 0.3, 0, 8],
  ["fish-sauce", "Fish sauce", "Nuoc-mâm", "CONDIMENT", "ml", 200, 35, 5.1, 0, 0, 3.6, 3.6, 0, 7850],
  ["tahini", "Tahini", "Purée de sésame", "CONDIMENT", "g", 300, 595, 17, 53.8, 7.6, 21, 0.5, 9.3, 115],
  ["mustard-wholegrain", "Wholegrain mustard", "Moutarde à l'ancienne", "CONDIMENT", "g", 200, 143, 8, 9, 0.6, 7, 1.5, 5, 1550],
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

  // ── Sweeteners ──────────────────────────────────────────────────────────────────────────
  ["white-sugar", "White sugar", "Sucre blanc", "SWEETENER", "g", 1000, 387, 0, 0, 0, 100, 100, 0, 1],
  ["brown-sugar", "Brown sugar", "Sucre roux", "SWEETENER", "g", 500, 380, 0, 0, 0, 98, 97, 0, 28],
  ["honey", "Honey", "Miel", "SWEETENER", "g", 500, 304, 0.3, 0, 0, 82, 82, 0.2, 4],
  ["maple-syrup", "Maple syrup", "Sirop d'érable", "SWEETENER", "ml", 250, 260, 0, 0, 0, 67, 60, 0, 12],
  ["powdered-sugar", "Powdered sugar", "Sucre glace", "SWEETENER", "g", 500, 389, 0, 0, 0, 100, 100, 0, 2],
  ["vanilla-sugar", "Vanilla sugar", "Sucre vanillé", "SWEETENER", "g", 100, 394, 0, 0, 0, 98, 98, 0, 1],
  ["agave-syrup", "Agave syrup", "Sirop d'agave", "SWEETENER", "ml", 250, 310, 0, 0, 0, 76, 68, 0.2, 4],

  // ── Other ───────────────────────────────────────────────────────────────────────────────
  ["water", "Water", "Eau", "OTHER", "l", 1, 0, 0, 0, 0, 0, 0, 0, 0],
  ["vegetable-broth", "Vegetable broth", "Bouillon de légumes", "OTHER", "l", 1, 5, 0.3, 0.1, 0, 0.7, 0.3, 0, 377],
  ["chicken-broth", "Chicken broth", "Bouillon de poulet", "OTHER", "l", 1, 4, 0.6, 0.1, 0, 0.4, 0.2, 0, 343],
  ["beef-broth", "Beef broth", "Bouillon de bœuf", "OTHER", "l", 1, 7, 1, 0.2, 0.1, 0.5, 0.2, 0, 356],
  ["bouillon-cube", "Bouillon cube", "Cube de bouillon", "OTHER", "pcs", 12, 230, 10, 14, 7, 17, 5, 0, 19000],
  ["soy-milk", "Soy milk", "Boisson au soja", "OTHER", "l", 1, 45, 3.3, 1.8, 0.3, 3.3, 2.5, 0.5, 40],
  ["tofu-silken", "Silken tofu", "Tofu soyeux", "OTHER", "g", 300, 55, 4.8, 2.7, 0.4, 2.3, 0.6, 0.2, 8],
  ["nori", "Nori seaweed", "Algues nori", "OTHER", "g", 25, 35, 5.8, 0.3, 0.1, 5.1, 0.5, 0.3, 48],
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
 * fifteenth costs every one of the 266 rows a re-alignment, for a value most of them do not have a
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
  "butternut-squash": "🎃", peas: "🫛", "green-beans": "🫛",
  // Fruit
  apple: "🍎", pear: "🍐", banana: "🍌", orange: "🍊", grapefruit: "🍊", lemon: "🍋",
  lime: "🍋", "lemon-juice": "🍋", grape: "🍇", clementine: "🍊", "raisins-dried": "🍇",
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
  "sausage-pork": "🌭", merguez: "🌭", chorizo: "🌭",
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
  "puff-pastry": "🥐", "shortcrust-pastry": "🥐",
  // Nuts and seeds
  peanuts: "🥜",
  // Sweeteners
  honey: "🍯", "agave-syrup": "🍯", "maple-syrup": "🍁", "white-sugar": "🍬",
  "brown-sugar": "🍬", "powdered-sugar": "🍬", "vanilla-sugar": "🍬",
  // Condiments
  salt: "🧂", ketchup: "🍅", "tomato-paste": "🍅", mayonnaise: "🥚", "hot-sauce": "🌶️",
  harissa: "🌶️", pesto: "🌿", hummus: "🫘", "vinegar-red-wine": "🍷",
  "fish-sauce": "🐟", tahini: "🥜", "mustard-wholegrain": "🟡",
  "rice-vinegar": "🍚", "oyster-sauce": "🦪", "hoisin-sauce": "🍶", "miso-paste": "🍜",
  "curry-paste-red": "🌶️", "preserved-lemon": "🍋",
  "soy-sauce": "🍶",
  // Spices
  "black-pepper": "🧂", paprika: "🌶️", "cayenne-pepper": "🌶️", "chili-powder": "🌶️",
  "garam-masala": "🧂", "curry-powder": "🧂", saffron: "🌼", "herbes-de-provence": "🌿",
  "ras-el-hanout": "🧂", "espelette-pepper": "🌶️", tarragon: "🌿",
  "paprika-smoked": "🌶️", "mustard-seeds": "🟡", lemongrass: "🌿",
  "ginger-ground": "🫚", "bay-leaf": "🌿", "dried-basil": "🌿", "dried-oregano": "🌿",
  // Oils
  "olive-oil": "🫒", "coconut-oil": "🥥", ghee: "🧈",
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
  gelatin: "🍮", "vanilla-extract": "🫙",
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
  potato: { fr: ["patates"], en: ["spuds"] },
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
  "creme-fraiche": { fr: ["crème"] },
  "heavy-cream": { fr: ["crème liquide", "crème entière", "crème liquide entière"] },
  "ground-beef-80-20": { fr: ["viande hachée", "steak haché"] },
  "beef-ground-90-10": { fr: ["viande hachée maigre"] },
  "chicken-breast": { fr: ["blanc de poulet", "escalope de poulet"] },
  // Not bare "poulet": a line reading "500 g de poulet" means pieces, and belongs on a part row.
  "chicken-whole": { fr: ["poulet fermier"] },
  "egg-whole": { fr: ["oeufs", "œufs"] },
  "pasta-dry": { fr: ["pâtes"] },
  "white-rice": { fr: ["riz"] },
  "flour-all-purpose": { fr: ["farine"] },
  "white-sugar": { fr: ["sucre", "sucre semoule"] },
  "brown-sugar": { fr: ["cassonade"] },
  cornstarch: { fr: ["fécule de maïs"] },
  honey: { fr: ["miel liquide"] },
  "olive-oil": { fr: ["huile d'olive", "huile"] },
  "black-pepper": { fr: ["poivre", "poivre du moulin"] },
  // Without it "noix de muscade" tied with the walnuts on the shared word.
  nutmeg: { fr: ["noix de muscade"] },
  paprika: { fr: ["paprika doux"] },
  salt: { fr: ["fleur de sel", "gros sel", "sel fin"] },
  "mustard-yellow": { fr: ["moutarde de dijon"] },
  "chicken-broth": { fr: ["bouillon de volaille"] },
  lemon: { fr: ["citron jaune"] },
  parsley: { fr: ["persil plat"] },
  couscous: { fr: ["semoule"] },
  "plain-yogurt": { fr: ["yaourt", "yaourts"] },
  emmental: { fr: ["fromage râpé", "râpé"] },
  baguette: { fr: ["pain"] },
  "bread-white": { fr: ["pain de mie"] },
  "tuna-canned-water": { fr: ["thon"] },
  shrimp: { fr: ["crevettes", "gambas"] },
  chickpeas: { fr: ["pois chiches"] },
  lardons: { fr: ["lardon"] },
  // A recipe writing "de la salade" means leaves, and the catalog's only leaves are these.
  "lettuce-romaine": { fr: ["salade", "salade verte"] },
  "spring-onion": { fr: ["oignon nouveau", "cébette", "ciboule"] },
  "bouillon-cube": { fr: ["bouillon cube", "tablette de bouillon"] },
  "curry-powder": { fr: ["curry"] },
  hummus: { en: ["houmous"] },
  "raisins-dried": { fr: ["raisin sec"] },
  "prunes-dried": { fr: ["pruneau"] },
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
};

/**
 * What one of an ingredient weighs, in grams — for the 66 rows a household counts rather than
 * weighs, plus the few written per piece in a recipe whatever the shop sells them by.
 *
 * Hand-compiled like the nutrition values above, for a medium specimen as sold: a whole raw item
 * before trimming, since that is what someone holds when they write "2 onions". Sparse by nature,
 * not by neglect — there is no such thing as one flour (see schema/ingredients.ts).
 *
 * **The three whole birds are the exception, and they are EDIBLE weight, not as sold.** A 1.4 kg
 * `poulet entier` is ~1000 g of meat and skin over ~400 g of carcass, and this number is what the
 * nutrition figures above are multiplied by: as-sold would bill the cook for the calories of a
 * frame they will boil for stock and throw away. An apple's 180 g still includes its core and a
 * cantaloupe's 550 g its rind, so this is an inconsistency rather than a rule — it is taken here
 * because a bird's inedible fraction is ~30% where a core is a rounding error, and because a
 * recipe writes "1 poulet" and means the meat on it.
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
  "ginger-fresh": 15, lemongrass: 20, "preserved-lemon": 40,
  // Fruits
  apple: 180, banana: 120, orange: 130, lemon: 100, lime: 65, cantaloupe: 550, pineapple: 900,
  mango: 200, kiwi: 75, peach: 150, pear: 180, plum: 65, apricot: 40, fig: 50, pomegranate: 280,
  grapefruit: 250, avocado: 200, clementine: 70, "prunes-dried": 10,
  // Grains, meat, dairy, egg
  baguette: 250, "tortilla-wrap": 60, "tortilla-corn": 30, "pizza-dough": 250, "puff-pastry": 230,
  "shortcrust-pastry": 230, "chicken-slices": 25, "turkey-slices": 25, merguez: 70,
  "flavoured-yogurt": 125, "egg-whole": 50, "egg-yolk": 17, camembert: 250,
  // Whole birds — meat and skin off the carcass, per the note above, not the weight on the label.
  "chicken-whole": 1000, "duck-whole": 1000, "turkey-whole": 3000,
  // A cube, as every recipe that calls for one means, and as the box is portioned.
  "bouillon-cube": 10,
  // Sold by weight, written by the piece — "2 bay leaves", never "0.4g of bay leaf".
  "bay-leaf": 0.2,
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
  baguette: 35, "bread-white": 30, "bread-whole-wheat": 30,
  // Cured and cooked meats, one deli slice
  ham: 20, prosciutto: 15, salami: 5, chorizo: 10, bacon: 15, "chicken-slices": 25,
  "turkey-slices": 25,
  // Cheese, one sandwich slice or one round of the log
  "cheddar-cheese": 30, emmental: 30, gruyere: 30, comte: 30, brie: 30, "goat-cheese": 20,
  mozzarella: 25,
  // Rounds — "rondelles" of a fruit or vegetable
  lemon: 10, lime: 7, tomato: 20, cucumber: 8,
};

/**
 * Density in grams per millilitre, for anything that can be poured or spooned.
 *
 * Wider than the 34 rows whose `defaultUnit` is a volume, because the unit that breaks nutrition is
 * the one a RECIPE uses, not the one a shop sells by: salt, flour, sugar and every spice are bought
 * by weight and written by the spoonful. A line this cannot convert costs the whole recipe its
 * nutrition, so the spoon-measured pantry is the half that matters most.
 *
 * The dry values are for the loose, unsifted, unpacked state a cook actually spoons — flour packs
 * from 0.53 to 0.7 depending on how it is scooped, which is the built-in imprecision of measuring
 * a solid by volume and not something a second decimal here would fix.
 */
const GRAMS_PER_ML: Record<string, number> = {
  // Dairy
  "milk-whole": 1.03, "milk-skim": 1.035, "milk-semi-skimmed": 1.03, "heavy-cream": 0.99,
  "single-cream": 1.01, "whipping-cream": 0.99, "evaporated-milk": 1.07, "condensed-milk": 1.28,
  "sour-cream": 0.98, "creme-fraiche": 0.98, "plain-yogurt": 1.03, "greek-yogurt": 1.05,
  "fromage-blanc": 1.03, butter: 0.91, "butter-unsalted": 0.91, "butter-salted": 0.91,
  // Oils
  "olive-oil": 0.91, "vegetable-oil": 0.92, "coconut-oil": 0.92, "sesame-oil": 0.92,
  "canola-oil": 0.92, "sunflower-oil": 0.92,
  // Condiments
  salt: 1.2, "soy-sauce": 1.15, "vinegar-white": 1.01, "balsamic-vinegar": 1.1, "hot-sauce": 1.05,
  "worcestershire-sauce": 1.1, ketchup: 1.14, "mustard-yellow": 1.05, mayonnaise: 0.91,
  "tomato-paste": 1.07, "peanut-butter": 1.08, capers: 0.85, "olives-green": 0.75, "olives-black": 0.75,
  // Sweeteners
  "white-sugar": 0.85, "brown-sugar": 0.8, "powdered-sugar": 0.56, "vanilla-sugar": 0.85, honey: 1.42,
  "maple-syrup": 1.32, "agave-syrup": 1.37,
  // Dry pantry, spooned
  "flour-all-purpose": 0.53, "whole-wheat-flour": 0.55, cornstarch: 0.6, cornmeal: 0.65,
  polenta: 0.65, breadcrumbs: 0.4, oats: 0.4, "cocoa-powder": 0.5, "baking-powder": 0.92,
  "baking-soda": 1.2, "dry-yeast": 0.75, gelatin: 0.8,
  // Seeds
  "chia-seeds": 0.65, "flax-seeds": 0.6, "sesame-seeds": 0.6, "poppy-seeds": 0.6,
  "sunflower-seeds": 0.55, "pumpkin-seeds": 0.55, "hemp-seeds": 0.5,
  // Ground spices, and the two dried herbs that behave like them
  "black-pepper": 0.45, cinnamon: 0.45, cumin: 0.45, paprika: 0.46, turmeric: 0.5,
  "ginger-ground": 0.5, nutmeg: 0.5, "chili-powder": 0.5, "cayenne-pepper": 0.5,
  "coriander-ground": 0.45, cloves: 0.5, cardamom: 0.45, "dried-oregano": 0.2, "dried-basil": 0.2,
  "garam-masala": 0.45, "curry-powder": 0.45, saffron: 0.35, "ras-el-hanout": 0.45,
  "espelette-pepper": 0.45, "herbes-de-provence": 0.2, "paprika-smoked": 0.46,
  "mustard-seeds": 0.65,
  // Fresh herbs, chopped — "1 tbsp of parsley". Light enough that the imprecision costs nothing.
  basil: 0.25, parsley: 0.25, cilantro: 0.25, mint: 0.25, thyme: 0.3, rosemary: 0.3, tarragon: 0.3,
  "oregano-fresh": 0.25, dill: 0.25, chives: 0.25, sage: 0.25,
  // Liquids
  water: 1, "vegetable-broth": 1, "chicken-broth": 1, "beef-broth": 1, "vanilla-extract": 0.88,
  "lemon-juice": 1.02, "vinegar-red-wine": 1.01, "fish-sauce": 1.02, tahini: 1.07,
  "mustard-wholegrain": 1.05, "soy-milk": 1.03, "rice-vinegar": 1.01, "oyster-sauce": 1.2,
  "hoisin-sauce": 1.2, "miso-paste": 1.2, "curry-paste-red": 1.1, "orange-blossom-water": 1,
  "coconut-milk": 0.98, "almond-milk": 1.03, "oat-milk": 1.03, passata: 1.05, "tomato-sauce": 1.05, "white-wine": 0.99,
  "red-wine": 0.99, beer: 1.01, "orange-juice": 1.05, "apple-juice": 1.05,
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
 * off a category or a name, so `parmesan` is `vegetarian` and `white-wine` is `vegan`.
 *
 * That is a real limitation and it is written down rather than papered over. Whoever wants to close
 * it closes it by splitting the row - a `parmigiano-reggiano` distinct from `parmesan` - not by
 * making this file hedge, because a hedge here silently strips `vegetarian` from every pasta dish
 * in the catalog.
 *
 * Allergen coverage runs to the EU-14 as they would appear on the packet. It is deepest where a tag
 * reads it (gluten, milk, nuts, peanuts) and thinnest where nothing does yet: cured meats commonly
 * declare sulphites and are recorded as carrying none, which is fine for the tags that exist and is
 * the first thing to fix if `sulphite-free` is ever wanted.
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
  "oyster-sauce": "pescatarian", "curry-paste-red": "pescatarian",
  // Parmesan in the jar, in every recipe and on every label that calls itself pesto.
  pesto: "vegetarian",

  // -- Sweeteners: honey is the whole reason this category has no default --------------------
  "white-sugar": "vegan", "brown-sugar": "vegan", "powdered-sugar": "vegan",
  "maple-syrup": "vegan", "agave-syrup": "vegan", "vanilla-sugar": "vegan", honey: "vegetarian",

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
  "milk-chocolate": "vegetarian",
  // Stock from an animal, and a setting agent made of its collagen. Both read as "OTHER".
  "chicken-broth": "omnivore", "beef-broth": "omnivore", gelatin: "omnivore",
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
  "tortilla-wrap": ["gluten"], "pizza-dough": ["gluten"],
  // Barley malt extract is what keeps cornflakes off a gluten-free table, despite the corn.
  "cereal-cornflakes": ["gluten"],
  // Egg in the dough, butter in the pastry.
  "fresh-tagliatelle": ["gluten", "eggs"], "egg-noodles": ["gluten", "eggs"],
  "puff-pastry": ["gluten", "milk"], "shortcrust-pastry": ["gluten", "milk"],

  // -- Fish, crustaceans and molluscs: three separate EU allergens, not one "seafood" --------
  salmon: ["fish"], "tuna-canned-water": ["fish"], cod: ["fish"], tilapia: ["fish"],
  sardines: ["fish"], trout: ["fish"], mackerel: ["fish"], anchovy: ["fish"],
  "salmon-smoked": ["fish"],
  // Anchovy, fermented — the sauce the DIET map above also singles out.
  "fish-sauce": ["fish"],
  shrimp: ["crustaceans"], crab: ["crustaceans"],
  mussels: ["molluscs"], scallops: ["molluscs"], squid: ["molluscs"],
  "oyster-sauce": ["molluscs"], "curry-paste-red": ["crustaceans"],

  // -- Tree nuts, and the rows that are not tree nuts ----------------------------------------
  almonds: ["nuts"], "almonds-flaked": ["nuts"], walnuts: ["nuts"], cashews: ["nuts"],
  pistachios: ["nuts"],
  pecans: ["nuts"], hazelnuts: ["nuts"], macadamia: ["nuts"], "brazil-nuts": ["nuts"],
  "almond-milk": ["nuts"],
  // A pine nut is a seed and is not on the EU-14, but it is sold, stored and reacted to as a nut.
  // Listed, because the direction to be wrong in is the one that WITHHOLDS `nut-free`.
  "pine-nuts": ["nuts"],
  // A peanut is a legume. Its own allergen, and someone allergic to tree nuts is often fine with
  // it - which is why `nut-free` withholds on either and the two are still recorded apart.
  peanuts: ["peanuts"], "peanut-butter": ["peanuts"],
  // Coconut is not an EU-14 nut: `coconut-fresh` and `coconut-milk` deliberately carry nothing.

  // -- Soy, sesame, celery, mustard ----------------------------------------------------------
  soybeans: ["soybeans"], edamame: ["soybeans"], "tofu-firm": ["soybeans"], tempeh: ["soybeans"],
  "sesame-seeds": ["sesame"], "sesame-oil": ["sesame"],
  // Tahini is what makes hummus sesame, and it is in every recipe for it.
  hummus: ["sesame"], tahini: ["sesame"],
  celery: ["celery"],
  // Stock, in a cube or a carton, is built on celery almost without exception.
  "vegetable-broth": ["celery"], "chicken-broth": ["celery"], "beef-broth": ["celery"],
  "bouillon-cube": ["celery"],
  "mustard-yellow": ["mustard"], "mustard-wholegrain": ["mustard"], "mustard-seeds": ["mustard"],

  // -- Everything else -----------------------------------------------------------------------
  // Brewed from wheat, and fermented from soy.
  "soy-sauce": ["gluten", "soybeans"],
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
  "vinegar-red-wine": ["sulphites"],
  beer: ["gluten", "sulphites"],
};

export const CATALOG: readonly CatalogEntry[] = ROWS.map(
  ([
    slug, en, fr, category, defaultUnit, defaultQuantity,
    calories, protein, fat, saturatedFat, carbohydrates, sugars, fiber, sodium,
  ]) => ({
    slug,
    en,
    fr,
    emoji: EMOJI[slug] ?? CATEGORY_EMOJI[category],
    aliases: ALIASES[slug] ?? {},
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
    nutrition: { calories, protein, fat, saturatedFat, carbohydrates, sugars, fiber, sodium },
  }),
);
