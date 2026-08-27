import { View, StyleSheet } from "react-native";
import { router } from "expo-router";

import { Badge } from "@ui/badge";
import { ButtonIcon } from "@ui/button-icon";
import { Heart, Share2, SquarePen } from "@ui/icons";
import { theme } from "theme";
import { useTranslations } from "translations";
import type { Tag } from "@shared/tags";

import { CONTENT_NEGATIVE_SPACE, SCREEN_PADDING } from "../../constants";
import { TAG_EMOJI } from "../../_model/vocabulary";

type Props = {
  /** The recipe the pencil opens. Absent only before the route parameter has arrived. */
  recipeId?: string;
  /** Stored keys, not words — the chip's glyph and its wording are this component's to look up. */
  tags: Tag[];
};

/**
 * How many chips fit across the photo before they start wrapping over the title.
 *
 * A recipe carries as many tags as apply and the computed half alone can be nine, so this is a
 * layout limit rather than an editorial one. The first few are the diet claims, which are the ones
 * somebody scanning a photo is looking for.
 */
const VISIBLE_TAGS = 3;

/**
 * What sits on top of the recipe photo: the actions on one corner, the tags on the other.
 *
 * Both rows are absolutely positioned against a fixed-height box rather than laid out in flow,
 * because the parallax header scales and translates this whole view as the page scrolls — a flow
 * layout would reflow under the transform instead of moving with it.
 *
 * It takes the tags rather than fetching them. The chrome above it already holds the recipe, and
 * this view is re-rendered by the parallax on every scroll frame — a subscription here would be a
 * second reader of one cache entry for data its parent had in hand.
 */
export const RecipeHeader = ({ recipeId, tags }: Props) => {
  const t = useTranslations("Recipe");

  return (
    <View style={styles.header}>
      <View style={styles.actions}>
        {/*
          * Inert, both of them. Favouriting has a table (`recipeFavorites`) and no router reaching
          * it; sharing has no link to share while a recipe is only ever the cook's own.
          */}
        <ButtonIcon variant="neutral" size="sm">{Heart}</ButtonIcon>
        <ButtonIcon variant="neutral" size="sm">{Share2}</ButtonIcon>
        {recipeId && (
          <ButtonIcon
            onPress={() => router.push(`/recipe/edit/${recipeId}`)}
            variant="neutral"
            size="sm"
          >
            {SquarePen}
          </ButtonIcon>
        )}
      </View>
      <View style={styles.tags}>
        {tags.slice(0, VISIBLE_TAGS).map((tag) => (
          <Badge key={tag} textColor={theme.colors.foreground}>
            {`${TAG_EMOJI[tag]} ${t(`Tags.${tag}`)}`}
          </Badge>
        ))}
      </View>
    </View>
  );
};

/** Tall enough for the photo to read as a photo before the content starts covering it. */
const HEADER_HEIGHT = 320;

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
