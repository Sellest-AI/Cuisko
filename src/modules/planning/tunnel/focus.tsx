import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";

import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { NUTRITION_PREFERENCES } from "@shared/preferences";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { CUISKO } from "~/lib/mascots";
import { TAG_EMOJI } from "~/lib/vocabulary";

import { optionsOf } from "../_model/options";
import { useTunnel } from "./_hooks/useTunnel";
import { useTunnelScrollHandler } from "./_hooks/useTunnelScrollHandler";
import { ChoiceRows } from "@ui/choice-rows";
import { StepHeader } from "@ui/step-header";

const GUTTER = theme.spacing[16];

/**
 * What the caller is aiming for nutritionally — the `seeks` half of their stored preferences.
 *
 * **This step used to ask something else, and the change is the point of the slice.** It offered a
 * hand-written `FOCUSES` list whose `low-calorie` and `low-carb` were the same question
 * `NUTRITION_PREFERENCES` already stored and aggregated, in a second vocabulary that behaved
 * differently: ticked here it steered one week and was thrown away, ticked in the preferences
 * sheet it was saved. Its remaining entries were cravings with no tag behind them and have moved
 * to the mood step, which is where a craving belongs.
 *
 * So the answer here is **stored, not weekly**: the step opens on what the caller last saved,
 * `commitPreferences` writes it back at the end of the tunnel, and `resetTunnelAtom` returns it to
 * unseeded rather than to empty.
 *
 * No ceiling, unlike the mood step, and for a different reason than the count: `resolveSeeks`
 * already unticks `low-calorie` when `high-calorie` is picked, which is a real constraint rather than
 * an arbitrary one, and the five that can be held together are compatible by construction — every
 * one of them is a tag a single recipe can carry at once. A cap here would refuse a combination
 * the catalog can actually satisfy.
 *
 * ⚠️ **These are desires, not verdicts.** PRODUCT.md's first anti-goal is that the app is not a
 * calorie policeman: `high-calorie` is here for someone eating to gain weight exactly as
 * `low-calorie` is for someone eating to lose, and nothing may render either back at the cook as a
 * judgement on what they made.
 */
export const TunnelFocus = () => {
  const t = useTranslations("Planning");
  /** The words for a tag belong to the vocabulary, not to whichever screen draws it. */
  const tVocabulary = useTranslations("Vocabulary");
  const { seeks, toggleSeek, isSeedLoading } = useTunnel();
  const onScroll = useTunnelScrollHandler();

  const options = optionsOf(NUTRITION_PREFERENCES, TAG_EMOJI, (preference) =>
    tVocabulary(`Tags.${preference}`));

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <StepHeader
        title={t("Tunnel.Focus.title")}
        subtitle={t("Tunnel.Focus.subtitle")}
        mascot={CUISKO.barbell}
      />
      {isSeedLoading ? (
        /**
         * A word rather than a row list: `seeks` is seeded once from what the caller last saved, and
         * `toggleSeek` is a deliberate no-op until it lands — so rows drawn early would swallow every
         * tap in silence and then leave the bar reading "Skip".
         */
        <Text.Base color={colors.muted}>{t("Tunnel.Focus.loading")}</Text.Base>
      ) : (
        <ChoiceRows options={options} selected={seeks} onToggle={toggleSeek} />
      )}
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET, paddingHorizontal: GUTTER },
});
