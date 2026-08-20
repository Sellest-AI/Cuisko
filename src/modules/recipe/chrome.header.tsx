import { View, StyleSheet } from "react-native";

import { Badge } from "@ui/badge";
import { ButtonIcon } from "@ui/button-icon";
import { Heart, Share2, SquarePen } from "@ui/icons";
import { theme } from "theme";

import { CONTENT_NEGATIVE_SPACE, SCREEN_PADDING } from "./constants";
import { router } from "expo-router";

type Props = {
  /** Diet and course labels, already written for display — "🥬 Vegetarian". */
  tags: string[];
};

/**
 * What sits on top of the recipe photo: the actions on one corner, the tags on the other.
 *
 * Both rows are absolutely positioned against a fixed-height box rather than laid out in flow,
 * because the parallax header scales and translates this whole view as the page scrolls — a flow
 * layout would reflow under the transform instead of moving with it.
 */
export const RecipeHeader = ({ tags }: Props) => (
  <View style={styles.header}>
    <View style={styles.actions}>
      <ButtonIcon variant="neutral" size="sm">{Heart}</ButtonIcon>
      <ButtonIcon variant="neutral" size="sm">{Share2}</ButtonIcon>
      {/* Placeholder id, until the chrome is handed a real recipe to know its own. */}
      <ButtonIcon
        onPress={() => router.push(`/recipe/edit/${PLACEHOLDER_RECIPE_ID}`)}
        variant="neutral"
        size="sm"
      >
        {SquarePen}
      </ButtonIcon>
    </View>
    <View style={styles.tags}>
      {tags.map((tag) => (
        <Badge key={tag} textColor={theme.colors.foreground}>{tag}</Badge>
      ))}
    </View>
  </View>
);

/** Tall enough for the photo to read as a photo before the content starts covering it. */
const HEADER_HEIGHT = 320;

/**
 * The recipe the pencil opens, until there is a real one to open.
 *
 * The chrome is handed its tags and nothing else, so it cannot name the recipe it is drawn over.
 * Fetching lands with `_hooks/`, and this goes with it.
 */
const PLACEHOLDER_RECIPE_ID = "3";

const styles = StyleSheet.create({
  header: {
    height: HEADER_HEIGHT,
    padding: SCREEN_PADDING,
    paddingBottom: SCREEN_PADDING + CONTENT_NEGATIVE_SPACE,
  },
  actions: {
    position: "absolute",
    top: SCREEN_PADDING,
    right: SCREEN_PADDING,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[12],
  },
  tags: {
    position: "absolute",
    bottom: SCREEN_PADDING + CONTENT_NEGATIVE_SPACE,
    left: SCREEN_PADDING,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[12],
  },
});
