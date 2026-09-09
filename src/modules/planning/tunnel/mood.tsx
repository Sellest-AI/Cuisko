import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";

import { theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { TASTES } from "@shared/tastes";

import { CUISKO } from "~/lib/mascots";
import { TAG_EMOJI } from "~/lib/vocabulary";

import { MAX_TASTES } from "../_model/model";
import { optionsOf } from "../_model/options";
import { useTunnel } from "./_hooks/useTunnel";
import { useTunnelScrollHandler } from "./_hooks/useTunnelScrollHandler";
import { ChoiceRows } from "./_components/choice-rows";
import { TunnelHeader } from "./_components/tunnel-header";

const GUTTER = theme.spacing[16];

/**
 * What the household is in the mood for. Optional, and capped at four.
 *
 * The cap is the reason this step is worth asking: a steer everything was ticked on is no steer,
 * and four cravings across a week of fourteen plates already means most plates answer to one.
 *
 * Drawn from @shared/tastes rather than from a list of its own. The list it replaced invented its
 * ids and its English labels here — `"one-pan"` against the tag vocabulary's `"one-pot"` — so a
 * craving named one thing in the tunnel and another on the recipe it was meant to match. Every row
 * now carries a tag a recipe can actually hold, with its word from `Vocabulary.Tags` and its glyph
 * from `TAG_EMOJI`.
 *
 * The narrower asks that used to live on their own step are folded in here, since the focus step
 * now asks about `seeks`. That is why the list is longer than it was; the cap is unchanged.
 */
export const TunnelMood = () => {
  const t = useTranslations("Planning");
  /** The words for a tag belong to the vocabulary, not to whichever screen draws it. */
  const tVocabulary = useTranslations("Vocabulary");
  const { moods, toggleMood } = useTunnel();
  const onScroll = useTunnelScrollHandler();

  const options = optionsOf(TASTES, TAG_EMOJI, (taste) => tVocabulary(`Tags.${taste}`));

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <TunnelHeader
        title={t("Tunnel.Mood.title")}
        subtitle={t("Tunnel.Mood.subtitle")}
        mascot={CUISKO["food-pile"]}
      />
      <ChoiceRows options={options} selected={moods} onToggle={toggleMood} max={MAX_TASTES} />
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET, paddingHorizontal: GUTTER },
});
