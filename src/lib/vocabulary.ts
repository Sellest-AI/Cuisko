/**
 * A glyph — and, where one has been drawn, a picture — for each value of the `shared/`
 * vocabularies the app draws as chips and tiles.
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

import type { ImageProps } from "expo-image";

import oven from "assets/images/equipments/oven.webp";
import blender from "assets/images/equipments/blender.webp";
import foodProcessor from "assets/images/equipments/food-processor.webp";
import mixer from "assets/images/equipments/mixer.webp";
import standMixer from "assets/images/equipments/stand-mixer.webp";
import microwave from "assets/images/equipments/microwave.webp";
import slowCooker from "assets/images/equipments/slow-cooker.webp";
import pressureCooker from "assets/images/equipments/pressure-cooker.webp";
import riceCooker from "assets/images/equipments/rice-cooker.webp";
import airFryer from "assets/images/equipments/air-fryer.webp";
import grill from "assets/images/equipments/grill.webp";
import waffleMaker from "assets/images/equipments/waffle-maker.webp";
import toaster from "assets/images/equipments/toaster.webp";

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
  "high-calorie": "🍔",
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
  pastry: "🧁",
  // Effort
  quick: "⚡",
  "one-pot": "🍲",
  "no-cook": "❄️",
  "make-ahead": "📅",
  "batch-cooking": "📦",
  "freezer-friendly": "🧊",
  budget: "💸",
  "few-ingredients": "🧾",
  // Occasion
  "comfort-food": "🍕",
  festive: "🎉",
  "kid-friendly": "🧒",
  spicy: "🌶️",
  // Character
  "veggie-forward": "🥦",
  /** 🌿 rather than the 🥗 the old mood list used: `salad` and `starter` already hold that one. */
  fresh: "🌿",
  "world-flavours": "🌍",
  "gut-friendly": "🫧",
  "high-fibre": "🫘",
  "iron-rich": "🥩",
  "fussy-eater": "🙃",
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

/**
 * A photograph of each appliance, which is what a tile draws when it has one.
 *
 * The glyphs above stay, and are not dead: `EQUIPMENT_EMOJI` is what a tile falls back to, and it
 * is the map C12's contract and the compiler's totality check are written against. Several of them
 * were approximations that a picture simply answers better — 📻 for a microwave, 🍟 for an air
 * fryer — which is the whole reason this map exists rather than a thirteenth round of glyph
 * hunting.
 *
 * Total for the same reason the glyph map is: an appliance added to `@shared/equipments` with no
 * picture is a compile error here, not a tile that quietly falls back to an emoji nobody chose.
 * That is a stronger contract than the fallback needs, and deliberately so — the fallback exists
 * for a render that has no picture *yet*, not as somewhere an entry can come to rest.
 */
export const EQUIPMENT_IMAGE: Record<Equipment, ImageProps["source"]> = {
  oven,
  blender,
  "food processor": foodProcessor,
  mixer,
  "stand mixer": standMixer,
  microwave,
  "slow cooker": slowCooker,
  "pressure cooker": pressureCooker,
  "rice cooker": riceCooker,
  "air fryer": airFryer,
  grill,
  "waffle maker": waffleMaker,
  toaster,
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
