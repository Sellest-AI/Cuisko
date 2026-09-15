import { View, StyleSheet } from "react-native";
import { router } from "expo-router";

import { Badge } from "@ui/badge";
import { ButtonIcon } from "@ui/button-icon";
import { CalendarPlus, Heart, Share2, SquarePen } from "@ui/icons";
import { theme } from "theme";
import { useTranslations } from "translations";
import type { Tag } from "@shared/tags";

import type { Id } from "~/lib/convex/api";
import { TAG_EMOJI } from "~/lib/vocabulary";

import { useSetRecipeFavorite } from "../../_hooks/useSetRecipeFavorite";
import { CONTENT_NEGATIVE_SPACE, SCREEN_PADDING } from "../../constants";

type Props = {
  /** The recipe the heart and the pencil act on. Absent only before the route parameter has arrived. */
  recipeId?: string;
  /** Stored keys, not words — the chip's glyph and its wording are this component's to look up. */
  tags: Tag[];
  /** From the `getOne` payload. The pencil renders only when this is exactly true. */
  isOwned?: boolean;
  /** From the `getOne` payload. Drives the heart's variant; absent until the recipe has arrived. */
  isFavorited?: boolean;
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
 * It takes the tags and the two flags rather than fetching them. The chrome above it already holds
 * the recipe, and this view is re-rendered by the parallax on every scroll frame — a subscription
 * here would be a second reader of one cache entry for data its parent had in hand. The favorite
 * WRITE is called from here, though: a mutation is not a subscription, and the heart is the only
 * thing that sends it.
 */
export const RecipeHeader = ({ recipeId, tags, isOwned, isFavorited }: Props) => {
  const t = useTranslations("Vocabulary");
  const { set } = useSetRecipeFavorite();

  /**
   * Guarded on the flag having arrived, not only on the id: before the payload lands there is no
   * state to send the opposite of, and a tap then would favorite or unfavorite at random.
   */
  const onHeart =
    recipeId && isFavorited !== undefined
      ? () => set(recipeId as Id<"recipes">, !isFavorited)
      : undefined;

  return (
    <View style={styles.header}>
      <View style={[styles.actions, styles.leftActions]}>
        <ButtonIcon
          onPress={() => router.push({ pathname: "/plan-recipe", params: { recipeId } })}
          variant="neutral"
          size="sm"
        >
          {CalendarPlus}
        </ButtonIcon>
      </View>
      <View style={[styles.actions, styles.rightActions]}>
        {/*
          * Only the author gets the pencil. The read no longer proves ownership, and offering to
          * edit a recipe whose save `updateOne` will refuse is a form the cook cannot submit.
          */}
        {recipeId && isOwned === true && (
          <ButtonIcon
            onPress={() => router.push(`/recipe/edit/${recipeId}`)}
            variant="neutral"
            size="sm"
          >
            {SquarePen}
          </ButtonIcon>
        )}
        {/*
          * Inert. A recipe is readable by any signed-in cook (ADR 0014), so a link CAN now be
          * shared — the button, its payload and its copy are a slice of their own.
          */}
        <ButtonIcon variant="neutral" size="sm">{Share2}</ButtonIcon>
        {/*
          * The kept state is the brand disc, not `danger`: that variant is documented as
          * destructive and is the only place in the app that fills a control with red.
          */}
        <ButtonIcon
          onPress={onHeart}
          disabled={onHeart === undefined}
          variant={isFavorited ? "primary" : "neutral"}
          size="sm"
        >
          {Heart}
        </ButtonIcon>
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
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
  },
  rightActions: {
    right: SCREEN_PADDING,
    justifyContent: "flex-end",
  },
  leftActions: {
    left: SCREEN_PADDING,
    justifyContent: "flex-start",
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
