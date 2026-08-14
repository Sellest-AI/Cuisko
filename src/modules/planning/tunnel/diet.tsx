import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";

import { CardChoice } from "@ui/cards/choice";
import { theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { DIETS, TILE_IMAGE } from "../_hooks/placeholders";
import { useTunnel } from "../_hooks/useTunnel";
import { useTunnelScrollHandler } from "../_hooks/useTunnelScrollHandler";
import { TunnelHeader } from "../_components/tunnel-header";

const COLUMNS = 3;
const GUTTER = theme.spacing[16];
const GAP = theme.spacing[8];

/** Step 2 — how the household eats. Several answers, because most households have several. */
export const TunnelDiet = () => {
  const t = useTranslations("Planning");
  const { width } = useWindowDimensions();
  const { diets, toggleDiet } = useTunnel();
  const onScroll = useTunnelScrollHandler();

  const tileWidth = (width - GUTTER * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <TunnelHeader title={t("Tunnel.Diet.title")} />
      <View style={styles.grid}>
        {DIETS.map((diet) => (
          <CardChoice
            key={diet.id}
            label={diet.label.slice(0, 8).trim().concat(diet.label.length > 8 ? "." : "")}
            imageSrc={TILE_IMAGE}
            width={tileWidth - 1}
            selected={diets.includes(diet.id)}
            onPress={() => toggleDiet(diet.id)}
            imageStyle={{ maxWidth: "90%", maxHeight: 64 }}
            elevated
          />
        ))}
      </View>
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET, paddingHorizontal: GUTTER },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
});
