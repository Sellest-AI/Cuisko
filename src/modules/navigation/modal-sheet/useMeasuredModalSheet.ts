import { useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import type { LayoutChangeEvent } from "react-native";

import { sheetSizeAtom } from "./state";

/**
 * The height a modal screen reports so the sheet can be cut to it.
 *
 * The sheet's size lives on the root stack — `app/_layout.tsx` — because presentation belongs to
 * whoever pushes the route, and no screen inside `(modals)` can reach it. So the screen declares and
 * the layout reads, exactly as `useModalAction` does with the action beside the close button.
 *
 * **Spread the returned handler onto an auto-height column, never onto a flexed one.** The layout
 * gives its frame an explicit height, so the screen inside it is laid out within bounds; `onLayout`
 * on a `flex: 1` root would report the frame's own height, feed it back as the next frame height,
 * and settle wherever the loop happened to stop. An auto-height column measures its content instead,
 * and that number does not move when the frame resizes — so it converges on the first pass.
 *
 * A virtualized list cannot be measured this way and should not try: `FlashList` reports no
 * intrinsic height and needs bounds of its own. Those screens use `useDeclaredModalSheet`.
 */
export const useMeasuredModalSheet = () => {
  const setSize = useSetAtom(sheetSizeAtom);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) =>
      setSize({ kind: "measured", height: event.nativeEvent.layout.height }),
    [setSize],
  );

  useEffect(() => () => setSize(null), [setSize]);

  return onLayout;
};
