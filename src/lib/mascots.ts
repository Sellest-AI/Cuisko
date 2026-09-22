/**
 * Cuisko, and the things he is holding.
 *
 * In `src/lib/` rather than inside `planning/` because the mascot is the app's face, not the
 * tunnel's — the tunnel is only the first screen to show it, and a second one asking for him
 * would otherwise have to reach into another module's interior to find him.
 *
 * Keyed by **what he is holding**, never by the screen he leads. A pose named `setup` is wrong the
 * first time it is drawn anywhere but the setup step, and a rename of an asset is the one kind of
 * change a screen diff does not show. `calendar` stays true wherever it is used.
 *
 * A total `Record` over the pose union, so a file added to `assets/images/cuisko/` and forgotten
 * here is visible as a key nothing references, rather than as a picture nobody knew had shipped.
 */

import type { ImageProps } from "expo-image";

import idle from "assets/images/cuisko/cuisko-idle.webp";
import saucepan from "assets/images/cuisko/cuisko-saucepan.webp";
import fish from "assets/images/cuisko/cuisko-fish.webp";
import barbell from "assets/images/cuisko/cuisko-barbell.webp";
import calendar from "assets/images/cuisko/cuisko-calendar.webp";
import stopwatch from "assets/images/cuisko/cuisko-stopwatch.webp";
import forbidden from "assets/images/cuisko/cuisko-forbidden.webp";
import foodPile from "assets/images/cuisko/cuisko-food-pile.webp";
import winkingHead from "assets/images/cuisko/cuisko-winking-head.webp";

/** What Cuisko is holding — the picture's own subject, not the question it happens to illustrate. */
export type CuiskoPose =
  | "idle"
  | "saucepan"
  | "fish"
  | "barbell"
  | "calendar"
  | "stopwatch"
  | "forbidden"
  | "food-pile";

export const CUISKO: Record<CuiskoPose, ImageProps["source"]> = {
  /** Standing there, hands empty. The face the app wears when the question is not about a thing. */
  idle,
  /** Chef's hat, walking with a saucepan. */
  saucepan,
  /** Holding a whole fish across both arms. */
  fish,
  /** Deadlifting a barbell, and unimpressed about it. */
  barbell,
  /** Holding up a month calendar. */
  calendar,
  /** Holding a gold pocket watch. */
  stopwatch,
  /** Holding a red no-entry sign. */
  forbidden,
  /** Perched on a mountain of dishes and packets. */
  "food-pile": foodPile,
};

/**
 * His face on its own, tipped over and winking. What a screen shows when it is greeting somebody
 * rather than illustrating a question.
 *
 * Deliberately NOT a key in `CUISKO`: that Record is keyed by what he is holding, and a crop is
 * not a thing he can hold — "winking-head" in there would make "what is Cuisko carrying"
 * answerable with "his own head". It lives in this file all the same, because this file is what
 * makes an asset in `assets/images/cuisko/` referenced rather than quietly shipped and forgotten.
 */
export const CUISKO_HEAD: ImageProps["source"] = winkingHead;
