import { router } from "expo-router";
import { type LayoutChangeEvent, Platform, StyleSheet, View } from "react-native";

import { ButtonPill } from "@ui/button-pill";
import { InstagramTile, MorphIcon, Share2, TikTokTile, WebTile, X } from "@ui/icons";
import { Orbit, type OrbitSatellite } from "@ui/orbit";
import { SafeAreaView } from "@ui/safe-area-view";
import { Text } from "@ui/text";
import { theme } from "~/global/theme";
import { useTranslations } from "translations";

import { useImportSharedLink } from "./_hooks/useImportSharedLink";
import { VIDEO_IMPORT_MINUTES } from "./_model/importCountdown";

type Props = {
  /** The link the cook shared, as the share sheet handed it over. */
  url: string;
  onLayout?: (event: LayoutChangeEvent) => void;
};

const ORBIT_SIZE = 260;
const TILE_SIZE = 48;
/** Long enough for the sheet to finish sliding up, so the cook sees the orbit arrive. */
const ENTRANCE_DELAY_MS = 300;

/**
 * Where a share could come from, placed where the design puts them: Instagram top left, TikTok on
 * the right, the web at the bottom, each leaning a little. Angles are degrees, clockwise from the right.
 */
const SATELLITES: OrbitSatellite[] = [
  { key: "instagram", node: <InstagramTile size={TILE_SIZE} />, angle: -145, tilt: -10 },
  { key: "tiktok", node: <TikTokTile size={TILE_SIZE} />, angle: -5, tilt: 10 },
  { key: "web", node: <WebTile size={TILE_SIZE} />, angle: 93, tilt: -6 },
];

/**
 * The sheet a share to Cuisko opens on: a recipe being imported, and the way out.
 *
 * It fetches nothing itself: `useImportSharedLink` owns the import and the navigation when it
 * lands. What this screen draws is the wait and, if it comes to that, the reason it ended: the
 * satellites leave, the share glyph morphs into an X, and the text says what happened. Close is
 * there the whole time, because closing is safe (see the hook).
 */
export const ShareImportScreen = ({ url, onLayout }: Props) => {
  const t = useTranslations("Recipe");
  const { status, failure } = useImportSharedLink(url);

  const failed = status === "failed";

  return (
    <SafeAreaView style={styles.container} onLayout={onLayout} edges={{ bottom: "android", top: "off" }}>
      <Orbit
        size={ORBIT_SIZE}
        satelliteSize={TILE_SIZE}
        satellites={SATELLITES}
        state={failed ? "dismissed" : "orbiting"}
        delay={ENTRANCE_DELAY_MS}
        center={<MorphIcon icon={failed ? X : Share2} size={44} strokeWidth={2.4} color={theme.colors.foreground} />}
        style={styles.orbit}
      />
      <View style={styles.copy}>
        <Text.Lg weight={600} style={styles.centered}>
          {failure ? t(failure.title) : t("Import.sharing_title")}
        </Text.Lg>
        <Text.Base color={theme.colors.muted} style={styles.centered}>
          {failure ? t(failure.body) : t("Import.sharing_body", { minutes: VIDEO_IMPORT_MINUTES })}
        </Text.Base>
      </View>
      <ButtonPill variant="neutral" size="lg" onPress={() => router.replace("/recipes")} style={styles.close}>
        {t("Import.close")}
      </ButtonPill>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingHorizontal: theme.spacing[16],
    paddingTop: theme.spacing[32],
    paddingBottom: Platform.select({ default: theme.spacing[16], android: 48 }),
  },
  orbit: { marginTop: theme.spacing[16], marginBottom: 56 },
  copy: { gap: theme.spacing[8], maxWidth: 320 },
  centered: { textAlign: "center" },
  close: { marginTop: theme.spacing[16], minWidth: 120 },
});
