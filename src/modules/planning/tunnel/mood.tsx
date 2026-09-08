import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";

import { theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { MAX_TASTES } from "../_model/model";
import { MOODS } from "../_hooks/placeholders";
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
 */
export const TunnelMood = () => {
  const t = useTranslations("Planning");
  const { moods, toggleMood } = useTunnel();
  const onScroll = useTunnelScrollHandler();

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <TunnelHeader title={t("Tunnel.Mood.title")} subtitle={t("Tunnel.Mood.subtitle")} />
      <ChoiceRows options={MOODS} selected={moods} onToggle={toggleMood} max={MAX_TASTES} />
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET, paddingHorizontal: GUTTER },
});
