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
import type { VideoSource } from "expo-video";
import { Platform } from "react-native";

import stockpotVideo from "assets/images/cuisko/cuisko-stockpot.webm";
import idle from "assets/images/cuisko/cuisko-idle.webp";
import saucepan from "assets/images/cuisko/cuisko-saucepan.webp";
import stockpot from "assets/images/cuisko/cuisko-stockpot.webp";
import fish from "assets/images/cuisko/cuisko-fish.webp";
import barbell from "assets/images/cuisko/cuisko-barbell.webp";
import calendar from "assets/images/cuisko/cuisko-calendar.webp";
import stopwatch from "assets/images/cuisko/cuisko-stopwatch.webp";
import forbidden from "assets/images/cuisko/cuisko-forbidden.webp";
import foodPile from "assets/images/cuisko/cuisko-food-pile.webp";

/** What Cuisko is holding — the picture's own subject, not the question it happens to illustrate. */
export type CuiskoPose =
  | "idle"
  | "saucepan"
  | "stockpot"
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
  /** Up to his elbows in a stockpot of soup, stirring it with a wooden spoon. */
  stockpot,
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
 * The poses that also exist as a looping video, and `null` where this platform cannot play one.
 *
 * ⚠️ **These are VP9-in-WebM with an alpha channel, and only the web can play them.** iOS cannot
 * decode VP9 at all (`expo-video` plays through AVFoundation there, and AVFoundation ships no WebM
 * demuxer and no VP9 decoder), and Android cannot honour the alpha channel — the result is not a
 * degraded video, it is a black rectangle with no error worth catching. The `null` is therefore the
 * honest value, not a precaution: a caller that gets one has to draw the still from `CUISKO`
 * instead, and the type makes that unavoidable rather than optional.
 *
 * The clip carries an alpha channel (`ALPHA_MODE 1`) so the mascot stays cut out over the page
 * rather than sitting in a box, and the web honours that.
 *
 * **To cover iOS, the same clip has to ship a second time as HEVC-with-alpha in an `.mov`** —
 * that is the only transparent video format Apple decodes. Add it as a sibling key here and pick
 * per platform; nothing else in the app has to change.
 */
export const CUISKO_VIDEO: Partial<Record<CuiskoPose, VideoSource | null>> = {
  stockpot: Platform.OS !== "web" ? null : stockpotVideo,
};
