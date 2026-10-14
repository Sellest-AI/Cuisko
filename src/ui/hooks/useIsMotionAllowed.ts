import { IS_OLD_DEVICE } from "@ui/utils";

import { useReduceMotion } from "./useReduceMotion";

/**
 * Whether a view may be given its layout animations and decorative loops.
 *
 * No to a reader who turned animations off, and no on an old device (`IS_OLD_DEVICE`). With
 * animations off, Reanimated is meant to skip them, and on Android the skip left grocery cards
 * frozen partway through a move; not attaching them at all leaves nothing to freeze.
 *
 * Starts at no, like `useReduceMotion` it reads, so a view mounted before the answer arrives
 * appears in place rather than fading in.
 */
export const useIsMotionAllowed = () => {
  const reduceMotion = useReduceMotion();

  return !reduceMotion && !IS_OLD_DEVICE;
};
