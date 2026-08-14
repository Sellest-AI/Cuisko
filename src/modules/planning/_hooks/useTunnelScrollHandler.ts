import { makeMutable, useAnimatedScrollHandler } from "react-native-reanimated";

/**
 * How far the step currently on screen has been scrolled, in points.
 *
 * Module-scoped for the same reason the draft is a module-scoped atom: the chrome outlives every
 * step's screen, and this value has to cross from one to the other. A shared value rather than
 * state because it is written on every scroll frame — as state it would re-render the whole tunnel
 * sixty times a second to move an opacity the UI thread can move on its own.
 */
export const tunnelScrollY = makeMutable(0);

/**
 * The reporter every scrolling step attaches to its list.
 *
 * A worklet handler, so the offset lands on the thread the gradient is drawn from: routed through
 * JS instead, the tint would lag the finger by however busy the bridge happens to be.
 */
export const useTunnelScrollHandler = () =>
  useAnimatedScrollHandler((event) => {
    tunnelScrollY.value = event.contentOffset.y;
  });
