import { StyleSheet, View } from "react-native";

import { Image } from "@ui/image";
import { useSafeAreaInsets } from "@ui/safe-area-view";
import { Text } from "@ui/text";
import { theme } from "theme";

import appIcon from "assets/icons/icon.png";
import heroImage from "assets/images/auth/auth-hero.webp";
import { LinearGradient } from "expo-linear-gradient";

const ICON_SIZE = 32;

/**
 * The photographed produce spread, with the app's lockup over it. Fills whatever height the sheet
 * below leaves; the sheet overlaps its bottom edge by one corner radius, so the photo runs under
 * the rounded corners rather than stopping short of them.
 */
export const Hero = () => {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <Image
        source={heroImage}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="center"
        transition={false}
      />

      <LinearGradient
        colors={[theme.colors.black, "transparent",]}
        style={{
          opacity: 0.4,
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 300
        }}
      />
      <LinearGradient
        colors={["transparent", theme.colors.black]}
        style={{
          opacity: 0.4,
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 300
        }}
      />
      <View style={[styles.lockup, { paddingTop: insets.top + theme.spacing[20] }]}>
        <Image source={appIcon} style={styles.icon} transition={false} />
        <Text.H4 color={theme.colors.white}>Cuisko</Text.H4>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.neutral.base },
  lockup: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[16],
    justifyContent: "center",
  },
  icon: { borderRadius: theme.radius.xs, height: ICON_SIZE, width: ICON_SIZE },
});
