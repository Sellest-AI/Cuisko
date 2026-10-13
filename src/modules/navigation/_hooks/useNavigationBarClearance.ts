import { Platform } from "react-native";

import { useSafeAreaInsets } from "@ui/safe-area-view";

import { NAVIGATION_BAR_OFFSET } from "../constants";

/**
 * How far a page pads the bottom of its scroll so its last row clears the navigation bar, which
 * floats over the page rather than sitting in it.
 *
 * On Android the bar sits above the system buttons (its `SafeAreaView` takes the bottom edge there
 * only), so the page clears those too. On iOS the bar already overlaps the home indicator, and the
 * constant alone is right.
 */
export const useNavigationBarClearance = () => {
  const { bottom } = useSafeAreaInsets();

  return NAVIGATION_BAR_OFFSET + Platform.select({ android: bottom, default: 0 });
};
