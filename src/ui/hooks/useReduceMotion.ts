import { atom, useAtom } from "jotai";
import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";

/** The OS's answer, shared app-wide: a view mounted later reads what an earlier one was told. */
const reduceMotionAtom = atom<boolean | undefined>(undefined);

/** The OS's answer, or `undefined` until it has given one; `useReduceMotion` decides what that means. */
const useReduceMotionAnswer = () => {
  const [reduceMotion, setReduceMotion] = useAtom(reduceMotionAtom);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {
        // The query can fail on a platform that does not implement it. Staying reduced is the
        // answer that cannot harm anyone, and it is already the state, so this only records that
        // the failure was considered rather than swallowed.
        if (active) setReduceMotion(true);
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, [setReduceMotion]);

  return reduceMotion;
};

/**
 * Whether the reader has asked their operating system to reduce motion.
 *
 * React Native exposes this as a promise and a change event rather than a hook, so the two are
 * bound together here: the initial answer, and every later toggle while the app is open. A reader
 * who turns the setting on mid-session has asked for the motion to stop now, not at the next
 * launch. The answer is kept in `reduceMotionAtom`, so once any view has heard it, every view
 * mounted after reads it on its first render.
 *
 * **Starts `true`, which is the unintuitive half.** Until the OS has answered once, there is no
 * answer, and the two defaults are not symmetrical: starting still and beginning to move is
 * something nobody notices, while starting in motion and stopping is the exact thing the setting
 * exists to prevent. So the unknown state is treated as "reduce", and the animation begins only
 * once the OS has said it may.
 */
export const useReduceMotion = (): boolean => useReduceMotionAnswer() ?? true;
