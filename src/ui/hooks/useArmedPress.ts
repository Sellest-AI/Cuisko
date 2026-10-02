import { useCallback, useEffect, useState } from "react";

/** How long the second tap is waited for before the button forgets the first. */
export const ARM_RESET_WINDOW_MS = 5000;

/**
 * How long after the arming tap a second one is ignored, so a double tap cannot confirm.
 *
 * Just past a double tap, which `Pressable` already locks against for 300ms, and no longer. The words
 * change to "Tap again" at once, and a cook who reads them and taps is answering the button: a longer
 * window swallowed that tap without a sign, and only a third one confirmed.
 */
export const ARMING_DELAY_MS = 350;

/**
 * A press that has to be made twice, for an action that cannot be taken back.
 *
 * Two taps rather than a dialog: `@ui` has no confirm sheet, and React Native's `Alert` does nothing
 * on web. The first tap arms and the button changes its words, the second confirms. Left alone it
 * disarms after `ARM_RESET_WINDOW_MS`, so a stray tap long afterwards cannot be the second one.
 *
 * Hand `doubleTapDelay` to the button: it is what drops a second tap arriving within
 * `ARMING_DELAY_MS` of the first, so a double tap only arms.
 */
export const useArmedPress = (onConfirm: () => void) => {
  const [isArmed, setIsArmed] = useState(false);

  useEffect(() => {
    if (!isArmed) return;

    const timer = setTimeout(() => setIsArmed(false), ARM_RESET_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [isArmed]);

  const onPress = useCallback(() => {
    if (!isArmed) return setIsArmed(true);

    setIsArmed(false);
    onConfirm();
  }, [isArmed, onConfirm]);

  return { isArmed, onPress, doubleTapDelay: ARMING_DELAY_MS };
};
