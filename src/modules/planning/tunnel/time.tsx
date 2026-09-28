import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { RowCardChoice } from "@ui/cards/row-choice";
import { theme } from "theme";
import { useTranslations } from "translations";

import { CUISKO } from "~/lib/mascots";
import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { COOKING_TIMES, type CookingTime } from "../_model/model";
import { useTunnel } from "./_hooks/useTunnel";
import { useTunnelScrollHandler } from "./_hooks/useTunnelScrollHandler";
import { StepHeader } from "@ui/step-header";

const GUTTER = theme.spacing[16];

/**
 * The glyph each answer wears, keyed by the answer itself so a new ceiling cannot be added to
 * `COOKING_TIMES` without one. Presentation, which is why it is here and not in the model.
 */
const EMOJI = {
  any: "🤷",
  "20": "⚡",
  "30": "🕧",
  "60": "🍳",
} as const satisfies Record<CookingTime, string>;

/**
 * How long there is to cook on an average evening.
 *
 * A step of its own rather than a "quick and easy" row on the mood step, because it is a ceiling
 * with a number behind it and not a craving: the generator can filter on twenty minutes, while it
 * can only interpret "quick". Single-select, since the answers nest — "under 20" is also under 30,
 * so allowing several would let the user assert a range and its own contradiction at once.
 *
 * Never skippable in the bar's sense: `any` is already selected, so the step always has an answer.
 */
export const TunnelTime = () => {
  const t = useTranslations("Planning");
  const { cookingTime, setCookingTime } = useTunnel();
  const onScroll = useTunnelScrollHandler();

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <StepHeader
        title={t("Tunnel.Time.title")}
        subtitle={t("Tunnel.Time.subtitle")}
        mascot={CUISKO.stopwatch}
      />
      <View style={styles.list}>
        {COOKING_TIMES.map((option) => (
          <RowCardChoice
            key={option}
            label={t(`Tunnel.Time.${option}`)}
            emoji={EMOJI[option]}
            selected={cookingTime === option}
            onPress={() => setCookingTime(option)}
          />
        ))}
      </View>
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET, paddingHorizontal: GUTTER },
  list: {
    flexDirection: "column",
    gap: theme.spacing[8],
  },
});
