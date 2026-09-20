import { useCallback, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Platform, View, type LayoutChangeEvent } from "react-native";

/**
 * What a `BlurTarget` and the `BlurScope` it feeds share: the ref every blur in the scope samples,
 * the two callbacks the target's native view reports through, and how many times it has settled.
 */
export type BlurTargetHandle = {
  ref: RefObject<View | null>,
  attach: (node: View | null) => void,
  settle: (event: LayoutChangeEvent) => void,
  /**
   * Bumped once per attach, on the target's first layout *with a size* after it. A blur keys its
   * native view on it, so a target that arrives after the blur has mounted remounts the blur
   * with the target. Stays 0 where nothing ever attaches.
   */
  generation: number,
};

/**
 * Where a blur reads what sits behind it — on Android only.
 *
 * iOS and web blur whatever is under the surface on their own. Android cannot: `expo-blur` there
 * needs the content named up front, as a `BlurTargetView` handed over by ref, and without one it
 * quietly falls back to a plain semi-transparent fill. So a screen with a real frosted surface
 * calls this, mounts a `BlurTarget` around the content and a `BlurScope` around the controls that
 * float over it, and every `BlurView` inside the scope picks the target up on its own.
 *
 * The generation moves on the target's first *sized* layout, not on its ref. A blur configured
 * against its target draws the sample once and is never redrawn on its own — the native blur's
 * per-frame hook only moves the sample, it does not repaint — so a target that is 0 px tall at
 * that moment (a header whose height is measured state, absent on the first frame) leaves the
 * blur empty until something forces a full redraw, which is what leaving the screen and coming
 * back used to do. `onLayout` is also only dispatched once the target exists natively, which the
 * ref alone does not guarantee. Only Android attaches anything: on the other platforms the target
 * is a plain `View`, the ref stays empty and no remount ever happens.
 */
export const useBlurTarget = (): BlurTargetHandle => {
  /** The node as published to the blurs: set on the sized layout, cleared on detach. */
  const [node, setNode] = useState<View | null>(null);
  const [generation, setGeneration] = useState(0);

  /** The node as attached, held back until its first sized layout publishes it. */
  const pending = useRef<View | null>(null);

  const attach = useCallback((next: View | null) => {
    if (Platform.OS !== "android") return;

    pending.current = next;
    if (next === null) setNode(null);
  }, []);

  const settle = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (pending.current === null || layout.width === 0 || layout.height === 0) return;

    setNode(pending.current);
    pending.current = null;
    setGeneration((current) => current + 1);
  }, []);

  const ref = useMemo(() => ({ current: node }), [node]);

  return useMemo(() => ({ ref, attach, settle, generation }), [ref, attach, settle, generation]);
};
