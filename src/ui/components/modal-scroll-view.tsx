import { useCallback, useState, type ComponentProps } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView } from "react-native";

type Props = ComponentProps<typeof ScrollView>;

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
 * `overScrollMode` is off because the bottom-edge glow reads as the list still moving when it has
 * stopped. Both can be overridden by the caller, as can everything else `ScrollView` takes.
 */
export const ModalScrollView = ({ onScroll, ...props }: Props) => {
  const [isAtTop, setIsAtTop] = useState(true);

  const trackTop = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIsAtTop(event.nativeEvent.contentOffset.y <= 0);
      onScroll?.(event);
    },
    [onScroll],
  );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
      nestedScrollEnabled={isAtTop}
      scrollEventThrottle={16}
      {...props}
      onScroll={trackTop}
    />
  );
};
