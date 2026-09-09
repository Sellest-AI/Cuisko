/**
 * A glyph for each value of the `shared/` vocabularies the app draws as chips and tiles.
 *
 * In `src/lib/` rather than inside a module because they are drawn in more than one place — the
 * recipe page chips a dish's tags and equipments, the planning tunnel tiles the kitchen's and
 * chips the household's constraints — and a glyph belongs to the vocabulary, not to whichever
 * module reached for it first.
 *
 * Here rather than in a translation file because a glyph is not a translation: 🥬 is 🥬 in every
 * language, and putting it in both locale files would be one string to keep in step per language
 * per entry. The word beside it comes from the `Vocabulary.*` namespace, which is laid out to
 * match this file block for block.
 *
 * A total `Record` rather than a partial map, for every one of them: an entry added to a shared
 * vocabulary with no glyph here is a compile error, not a chip with a blank in front of it. The
 * matching translation is caught by C12 rather than by the compiler, since JSON has no such type.
 */

import type { Allergen } from "@shared/allergens";
import type { Diet } from "@shared/diets";
import type { Equipment } from "@shared/equipments";
import type { Tag } from "@shared/tags";

export const TAG_EMOJI: Record<Tag, string> = {
  // Diet — what it does not contain
  vegetarian: "🥬",
  vegan: "🌱",
  pescatarian: "🐟",
  "gluten-free": "🌾",
  "dairy-free": "🥛",
  "nut-free": "🥜",
  // Nutrition
  "high-protein": "💪",
  "low-carb": "🍞",
  "low-calorie": "🪶",
  "high-calorie": "🔋",
  // Course
  breakfast: "🥐",
  brunch: "🍳",
  starter: "🥗",
  main: "🍽️",
  side: "🥖",
  dessert: "🍰",
  snack: "🍪",
  drink: "🥤",
  // Form
  soup: "🥣",
  salad: "🥗",
  sandwich: "🥪",
  pasta: "🍝",
  bowl: "🍲",
  baking: "🧁",
  // Effort
  quick: "⚡",
  "one-pot": "🍲",
  "no-cook": "❄️",
  "make-ahead": "📅",
  "batch-cooking": "📦",
  "freezer-friendly": "🧊",
  budget: "💸",
  // Occasion
  "comfort-food": "🫂",
  festive: "🎉",
  "kid-friendly": "🧒",
  spicy: "🌶️",
};

export const EQUIPMENT_EMOJI: Record<Equipment, string> = {
  oven: "🔥",
  blender: "🌀",
  "food processor": "🍲",
  mixer: "🥣",
  "stand mixer": "🎂",
  microwave: "📻",
  "slow cooker": "🍯",
  "pressure cooker": "⏲️",
  "rice cooker": "🍚",
  "air fryer": "🍟",
  grill: "🍢",
  "waffle maker": "🧇",
  toaster: "🍞",
};

export const DIET_EMOJI: Record<Diet, string> = {
  vegan: "🌱",
  vegetarian: "🥬",
  pescatarian: "🐟",
  omnivore: "🍖",
};

/**
 * The regulated fourteen. Several are approximations — there is no celery and no sulphite emoji —
 * and that is acceptable here in a way it would not be in the label: the glyph decorates a chip
 * whose word is the actual claim, never replaces it. Nothing may render one of these alone.
 */
export const ALLERGEN_EMOJI: Record<Allergen, string> = {
  gluten: "🌾",
  crustaceans: "🦐",
  eggs: "🥚",
  fish: "🐟",
  peanuts: "🥜",
  soybeans: "🫘",
  milk: "🥛",
  nuts: "🌰",
  celery: "🥬",
  mustard: "🥫",
  sesame: "🥯",
  sulphites: "🍷",
  lupin: "🌼",
  molluscs: "🦪",
};
