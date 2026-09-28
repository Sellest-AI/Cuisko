import gratinCover from "assets/images/onboarding/covers/gratin.webp";
import tartifletteCover from "assets/images/onboarding/covers/tartiflette.webp";
import hachisParmentierCover from "assets/images/onboarding/covers/hachis-parmentier.webp";
import bangersAndMashCover from "assets/images/onboarding/covers/bangers-and-mash.webp";
import ribollitaCover from "assets/images/onboarding/covers/ribollita.webp";
import mushroomRisottoCover from "assets/images/onboarding/covers/mushroom-risotto.webp";
import beefNoodlesCover from "assets/images/onboarding/covers/beef-noodles.webp";
import spanishTortillaCover from "assets/images/onboarding/covers/spanish-tortilla.webp";
import chiliConCarneCover from "assets/images/onboarding/covers/chili-con-carne.webp";
import saladNicoiseCover from "assets/images/onboarding/covers/salad-nicoise.webp";
import tikkaMasalaCover from "assets/images/onboarding/covers/tikka-masala.webp";

import gratinPlate from "assets/images/onboarding/plates/gratin.webp";
import tartiflettePlate from "assets/images/onboarding/plates/tartiflette.webp";
import hachisParmentierPlate from "assets/images/onboarding/plates/hachis-parmentier.webp";
import bangersAndMashPlate from "assets/images/onboarding/plates/bangers-and-mash.webp";
import ribollitaPlate from "assets/images/onboarding/plates/ribollita.webp";
import mushroomRisottoPlate from "assets/images/onboarding/plates/mushroom-risotto.webp";
import beefNoodlesPlate from "assets/images/onboarding/plates/beef-noodles.webp";
import spanishTortillaPlate from "assets/images/onboarding/plates/spanish-tortilla.webp";
import chiliConCarnePlate from "assets/images/onboarding/plates/chili-con-carne.webp";
import saladNicoisePlate from "assets/images/onboarding/plates/salad-nicoise.webp";
import tikkaMasalaPlate from "assets/images/onboarding/plates/tikka-masala.webp";

import type { RecipeId } from "./_model/fixtures";

/** What a bundled `.webp` import is: narrower than an image source, so the parallax header takes it. */
type BundledImage = number | string;

/**
 * Each fixture recipe's two pictures, as the catalogue has them: downloaded and bundled so the
 * onboarding draws them offline, instantly and the same on every run. Both went through the same
 * crop and `compressImage` as `scripts/images/compress-image.ts`, with a cap on the longest side.
 *
 * Apart from `_model/fixtures.ts` because a bundled asset is a module handle, and the model stays
 * free of anything but data. Total `Record`s, so a recipe added to the fixtures without its
 * pictures does not compile.
 */

/**
 * The dish photographed as served: what a recipe card shows, on the search grid and the import.
 * Capped at 540 px, the widest a half-width card draws it on a 3x screen.
 */
export const COVERS: Record<RecipeId, BundledImage> = {
  gratin: gratinCover,
  tartiflette: tartifletteCover,
  "hachis-parmentier": hachisParmentierCover,
  "bangers-and-mash": bangersAndMashCover,
  ribollita: ribollitaCover,
  "mushroom-risotto": mushroomRisottoCover,
  "beef-noodles": beefNoodlesCover,
  "spanish-tortilla": spanishTortillaCover,
  "chili-con-carne": chiliConCarneCover,
  "salad-nicoise": saladNicoiseCover,
  "tikka-masala": tikkaMasalaCover,
};

/**
 * The dish cut out on its plate: what planning draws, on the day grid and the week. Capped at
 * 480 px, the widest a tile draws it on a 3x screen.
 */
export const PLATES: Record<RecipeId, BundledImage> = {
  gratin: gratinPlate,
  tartiflette: tartiflettePlate,
  "hachis-parmentier": hachisParmentierPlate,
  "bangers-and-mash": bangersAndMashPlate,
  ribollita: ribollitaPlate,
  "mushroom-risotto": mushroomRisottoPlate,
  "beef-noodles": beefNoodlesPlate,
  "spanish-tortilla": spanishTortillaPlate,
  "chili-con-carne": chiliConCarnePlate,
  "salad-nicoise": saladNicoisePlate,
  "tikka-masala": tikkaMasalaPlate,
};
