/**
 * A glyph for each value of the two `shared/` vocabularies the app draws as chips and tiles.
 *
 * In `src/lib/` rather than inside a module because both are drawn in more than one place — the
 * recipe page chips a dish's tags and equipments, the planning tunnel tiles the kitchen's — and a
 * glyph belongs to the vocabulary, not to whichever module reached for it first.
 *
 * Here rather than in a translation file because a glyph is not a translation: 🥬 is 🥬 in every
 * language, and putting it in both locale files would be one string to keep in step per language
 * per tag. The word beside it comes from `Recipe.Tags.*` and `Recipe.Equipments.*`.
 *
 * `Record<Tag, string>` and `Record<Equipment, string>` rather than a partial map: a tag added to
 * @shared/tags with no glyph here is a compile error, not a chip with a blank in front of it.
 */

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
