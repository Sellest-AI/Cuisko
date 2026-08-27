import { useState } from "react";
import { LayoutChangeEvent, View, StyleSheet } from "react-native";

import { m } from "@ui/motion";
import { Text } from "@ui/text";
import { theme } from "theme";

import { SCREEN_PADDING } from "../../constants";

type Props = {
  title: string;
  description: string;
  /** Whether the intro belongs on screen — it collapses rather than unmounts when it does not. */
  expanded: boolean;
};

/**
 * The recipe's title and blurb, which the overview tab shows and the other two fold away.
 *
 * It collapses instead of unmounting, and the height it collapses to and from is measured rather
 * than declared. `height: "auto"` is not an animatable value — Reanimated has no number to
 * interpolate towards — so an `exit` animation on a conditionally rendered block snapped shut
 * instead of closing. The text is laid out absolutely inside a clipped box, so it reports its
 * natural height regardless of what the box is currently animating to, and the box animates
 * between 0 and that number.
 */
export const RecipeIntro = ({ title, description, expanded }: Props) => {
  const [height, setHeight] = useState(0);

  /**
   * The first measurement lands without animating.
   *
   * Height starts at 0 because nothing has been measured yet, so an intro that is already expanded
   * on mount would otherwise unfold from nothing every time a recipe is opened — an entrance
   * animation for a page that never moved. Animation is switched on a frame after that first
   * height commits, which is what makes the initial snap silent and every toggle after it animate.
   */
  const [animates, setAnimates] = useState(false);

  const measure = (event: LayoutChangeEvent) => {
    setHeight(event.nativeEvent.layout.height);
    if (!animates) requestAnimationFrame(() => setAnimates(true));
  };

  return (
    <m.View
      style={styles.clip}
      animate={{ height: expanded ? height : 0, opacity: expanded ? 1 : 0 }}
      transition={{ type: "timing", duration: animates ? COLLAPSE_DURATION : 0 }}
      pointerEvents={expanded ? "auto" : "none"}
    >
      <View style={styles.content} onLayout={measure}>
        <Text.H4 style={styles.title}>{title}</Text.H4>
        <Text.Body color={theme.colors.neutral.muted}>{description}</Text.Body>
      </View>
    </m.View>
  );
};

/** Long enough to read as the page rearranging itself, short enough not to delay the tab switch. */
const COLLAPSE_DURATION = 280;

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  content: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: theme.spacing[20],
  },
  title: { marginBottom: theme.spacing[12] },
});
