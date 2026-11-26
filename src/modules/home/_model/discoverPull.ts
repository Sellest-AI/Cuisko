/**
 * How far past the bottom of home a finger must pull to open the Explore page, in points. About a
 * thumb's flick: far enough that a scroll which merely reaches the bottom never opens it.
 */
export const DISCOVER_PULL = 80;

/**
 * How tall Android's strip of blank scroll under home is: the pull, and some room past it.
 *
 * Android has no bounce, so the scroll stops dead at the strip's end. A strip exactly as tall as
 * the pull put 1 at that very end, and the offset Android reports there, pixels turned to points,
 * can fall a fraction short: the ring stopped at 99 % and the page never opened. The extra room
 * puts 1 inside the strip, where a finger reaches it.
 */
export const DISCOVER_STRIP = DISCOVER_PULL + 24;

/**
 * How much of the pull is done, from 0 to 1: how far the scroll is past the bottom of the content,
 * over `DISCOVER_PULL`.
 *
 * `content` is the content's height without anything added under it to pull into (Android's
 * spacer), so the same measure serves the iOS bounce and the Android strip. A page shorter than
 * its viewport is never past its bottom: there is nothing to scroll, and nothing to pull.
 *
 * A worklet, because the scroll handler reads it on the UI thread on every frame.
 */
export const pullProgressOf = ({ offset, viewport, content }: { offset: number; viewport: number; content: number }) => {
  "worklet";
  if (content < viewport) return 0;

  const past = offset + viewport - content;

  return Math.min(Math.max(past / DISCOVER_PULL, 0), 1);
};

/** How far above the bottom an offset can read and still be the bottom: Android's pixels-to-points rounding. */
const AT_BOTTOM_SLACK = 2;

/**
 * Whether the scroll sits at the bottom of the content: where a pull may start.
 *
 * The pull is armed only from here, so a scroll that merely arrives at the bottom stops there,
 * and the next drag is the one that pulls. `content` is measured without the strip, as for
 * `pullProgressOf`. A page shorter than its viewport has no bottom to pull past.
 *
 * A worklet, read by the scroll handler on the UI thread.
 */
export const isAtBottomOf = ({ offset, viewport, content }: { offset: number; viewport: number; content: number }) => {
  "worklet";
  if (content < viewport) return false;

  return offset + viewport >= content - AT_BOTTOM_SLACK;
};
