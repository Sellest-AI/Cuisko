import { useState } from "react";
import { LayoutChangeEvent, View, StyleSheet, Platform } from "react-native";

import { Avatar } from "@ui/avatar";
import { Image } from "@ui/image";
import { Pressable } from "@ui/pressable";
import { m } from "@ui/motion";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { SCREEN_PADDING } from "../../constants";
import { CUISKO_HEAD } from "~/lib/mascots";

type Props = {
  chef?: {
    avatarSeed: string;
    name: string;
  },
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
export const RecipeIntro = ({ chef, title, description, expanded }: Props) => {
  const t = useTranslations("Recipe");
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

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

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
        <View style={styles.chef}>
          {!chef && <Image
            source={CUISKO_HEAD}
            style={styles.mascot}
          />}
          {chef && <View style={styles.avatar}>
            <Avatar
              variant="bare"
              seed={chef.avatarSeed}
              size={24}
            />
          </View>}
          <Text.Base color={theme.colors.neutral.muted}>
            {t("Chrome.created_by")} <Text.Base color={theme.colors.primary.base}>{chef?.name ?? "Cuisko"}</Text.Base>
          </Text.Base>
        </View>
        <Text.H4 style={TITLE_STYLE}>
          {title}
        </Text.H4>
        <Pressable onPress={() => setDescriptionExpanded((prev) => !prev)}>
          <Text.Body
            color={theme.colors.neutral.muted}
            numberOfLines={descriptionExpanded ? undefined : 2}
            style={Platform.OS === "android" && !descriptionExpanded ? styles.textClamped : styles.text}
          >
            {description}
          </Text.Body>
        </Pressable>
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
    paddingBottom: theme.spacing[16],
    justifyContent: "center",
  },
  chef: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[8],
    marginBottom: theme.spacing[12],
  },
  mascot: { width: 16, height: 16, objectFit: "contain" },
  /** Narrower than the 24 pt face it holds, so the face overhangs and the credit stays compact. */
  avatar: { width: 14, height: 16, justifyContent: "center", alignItems: "center" },
  title: { textAlign: "center", marginBottom: theme.spacing[12] },
  text: { textAlign: "center" },
  /** Android only, while the description is clamped to two lines; expanded, it centres like iOS. */
  textClamped: { textAlign: "left" },
});

/**
 * Outside the stylesheet because `textBalance` is `Text`'s own key, not a style property
 * `StyleSheet.create` accepts; built once here rather than spread on every render.
 */
const TITLE_STYLE = { ...styles.title, textBalance: true };
