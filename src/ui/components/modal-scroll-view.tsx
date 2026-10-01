import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState, type ComponentProps, type Ref } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView } from "react-native";

type Props = ComponentProps<typeof ScrollView> & {
  /**
   * Forwarded to the `ScrollView` underneath, so a caller can drive it — `scrollToEnd` on a
   * conversation that is still growing, for one. React 19 passes `ref` as an ordinary prop, but
   * `ScrollViewProps` does not declare one, so it is declared here or callers cannot pass it.
   */
  ref?: Ref<ScrollView>;
};

/**
 * A `ScrollView` for a screen presented as a form sheet.
 *
 * Android's form sheet is a bottom sheet, and it settles who owns a drag by nested scrolling: a
 * list that does not take part in it never gets the drag at all, and one that does hands the drag
 * over the moment it can scroll no further up — mid-gesture, so a swipe back to the top of a long
 * list closes the sheet in the same movement. Neither is what a reader expects. The sheet only
 * looks at the list *when a gesture starts*, so nested scrolling is switched on at the top and off
 * everywhere else: a drag that begins scrolled down stays in the list all the way up, and the next
 * one, beginning at the top, is the sheet's to close with. iOS ignores the prop and behaves this
 * way already.
 *
 * `alwaysBounceVertical` is on because iOS dismisses a sheet by the list bouncing past its top, and
 * a list whose content fits the sheet does not bounce by default — the greeting of an empty
 * conversation could not be dragged down to close. Android ignores it.
 *
 * `overScrollMode` is off because the bottom-edge glow reads as the list still moving when it has
 * stopped. Both can be overridden by the caller, as can everything else `ScrollView` takes.
 */
export const ModalScrollView = ({ onScroll, onLayout, ref, ...props }: Props) => {
  const [isAtTop, setIsAtTop] = useState(true);

  /**
   * The offset the last scroll event reported, mirrored outside React state.
   *
   * `isAtTop` is re-derived at moments where no scroll event is coming — a layout pass after the
   * screen was detached — and a state value read inside a callback is the value that callback
   * closed over. The ref is the one reading that is current at the moment it is read.
   */
  const offset = useRef(0);

  const trackTop = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = event.nativeEvent.contentOffset.y;
      setIsAtTop(offset.current <= 0);
      onScroll?.(event);
    },
    [onScroll],
  );

  /**
   * Nested scrolling goes back on while the screen is away, and comes back off once it is laid out.
   *
   * Android's sheet does not merely *read* this prop per gesture — it finds the list it will hand
   * drags to exactly once, in the layout pass that follows the screen being attached, and it only
   * considers a list that takes part in nested scrolling. Pushing a screen over the sheet detaches
   * this one; returning to it runs that search again. A reader who had scrolled down before leaving
   * comes back to a prop that is `false`, so the search finds nothing, and a sheet with no list to
   * hand drags to takes every drag itself — the modal dismisses from anywhere, until it is reopened.
   *
   * Switching back on at blur is what the search finds on the way back in. Restoring the real answer
   * on the next layout pass is safe because the sheet has already cached the list by then: it keeps
   * the reference, and re-reads the flag per gesture, which is the part this component wants to own.
   */
  useFocusEffect(useCallback(() => () => setIsAtTop(true), []));

  const restoreOnLayout = useCallback<NonNullable<Props["onLayout"]>>(
    (event) => {
      setIsAtTop(offset.current <= 0);
      onLayout?.(event);
    },
    [onLayout],
  );

  return (
    <ScrollView
      ref={ref}
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
      alwaysBounceVertical
      nestedScrollEnabled={isAtTop}
      scrollEventThrottle={16}
      {...props}
      onScroll={trackTop}
      onLayout={restoreOnLayout}
    />
  );
};
