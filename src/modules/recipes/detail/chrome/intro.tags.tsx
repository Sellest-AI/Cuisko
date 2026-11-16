import { View, StyleSheet } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { Text } from "@ui/text";
import { useIsMotionAllowed } from "@ui/hooks/useIsMotionAllowed";
import { HorizontalScrollView } from "@ui/horizontal-scroll-view";
import { theme } from "theme";
import { useTranslations } from "translations";

import type { Cuisine } from "@shared/cuisines";
import { TAGS, type Tag } from "@shared/tags";

import { TAG_EMOJI } from "~/lib/vocabulary";

import { SCREEN_PADDING } from "../../constants";

type Props = {
  cuisine: Cuisine;
  tags: readonly Tag[];
};

/**
 * Everything the recipe is filed under — its cuisine, then every tag it carries — in one row that
 * scrolls sideways. The intro shows it only once the cook has opened the description.
 *
 * Every tag, computed and authored alike: the editor draws both, and a tag the editor shows but the
 * page hides would read as a bug. The free-from tags already say "no known gluten" in their own
 * words (`Vocabulary.Tags`), so the claim of absence is worded where it is translated, not here.
 *
 * In vocabulary order rather than stored order, so the diet tags lead and two recipes list the
 * tags they share in the same places. `other` is left out: "Autre" files the recipe under nothing.
 *
 * Badges, not chips: nothing here is a filter yet, and a row of chips that answers no tap would
 * promise one. One line per badge, never wrapped — the row scrolls, so "Sans fruits à coque connus"
 * takes the width it needs instead of breaking in two.
 */
export const IntroTags = ({ cuisine, tags }: Props) => {
  const tVocabulary = useTranslations("Vocabulary");
  const isMotionAllowed = useIsMotionAllowed();

  const ordered = TAGS.filter((tag) => tags.includes(tag));
  const showsCuisine = cuisine !== "other";

  if (!showsCuisine && ordered.length === 0) return null;

  return (
    <Animated.View
      entering={isMotionAllowed ? FadeIn.duration(FADE_DURATION) : undefined}
      exiting={isMotionAllowed ? FadeOut.duration(FADE_DURATION) : undefined}
      style={styles.bleed}
    >
      <HorizontalScrollView contentContainerStyle={styles.row}>
        {showsCuisine && (
          <View style={styles.badge}>
            <Text.Base color={theme.colors.neutral.muted}>
              {`${CUISINE_EMOJI}  ${tVocabulary(`Cuisines.${cuisine}`)}`}
            </Text.Base>
          </View>
        )}
        {ordered.map((tag) => (
          <View key={tag} style={styles.badge}>
            <Text.Base color={theme.colors.neutral.muted}>
              {`${TAG_EMOJI[tag]}  ${tVocabulary(`Tags.${tag}`)}`}
            </Text.Base>
          </View>
        ))}
      </HorizontalScrollView>
    </Animated.View>
  );
};

/**
 * One globe for every cuisine rather than a flag each: half of them name a region, not a country
 * ("Europe de l'Est", "Levantine"), and a flag would claim a border the recipe never did.
 */
const CUISINE_EMOJI = "🌍";

/** As quick as the description's own unfolding, so the row lands with the text rather than after it. */
const FADE_DURATION = 200;

const styles = StyleSheet.create({
  /**
   * Out to both screen edges, padding its own content back in: a row longer than the screen then
   * looks cut by the screen rather than by the intro's gutter. Same pattern as `GroceryRow`.
   */
  bleed: {
    marginHorizontal: -SCREEN_PADDING,
    marginTop: theme.spacing[12],
  },
  /** Centred under the centred intro while it fits; `flexGrow` lets it fill, and still scroll past. */
  row: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: SCREEN_PADDING,
    gap: theme.spacing[8],
  },
  badge: {
    backgroundColor: theme.colors.transparent.light,
    borderColor: theme.colors.border.medium,
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.radius.full,
    borderWidth: 2,
  }
});
