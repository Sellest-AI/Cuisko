import { Platform, StyleSheet, View } from "react-native";

import { Image } from "@ui/image";
import { theme } from "theme";

import heroImage from "assets/images/auth/auth-hero.webp";
import { LinearGradient } from "expo-linear-gradient";

/**
 * Tall enough for the photo to read as produce, short enough that the sheet still leaves the page
 * that asked for the sign-in in sight above it on a small phone.
 */
const BANNER_HEIGHT = 320;

/**
 * The photographed produce spread: the banner at the top of the sign-in sheet. A fixed height,
 * because the sheet is cut to its content's height (`useMeasuredModalSheet`) and a banner that
 * filled the space left would leave it none.
 */
export const Hero = () => {
  return (
    <View style={styles.container}>
      <Image
        source={heroImage}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={Platform.select({ ios: "center", android: "top" })}
        transition={false}
      />
      {/* Darkens the photo toward the sheet's body, under the close button. */}
      <LinearGradient
        colors={["transparent", theme.colors.black]}
        style={[StyleSheet.absoluteFill, styles.shade]}
      />
      <View style={styles.bottomBar} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.neutral.base,
    height: BANNER_HEIGHT,
    overflow: "hidden",
    marginBottom: -theme.spacing[20],
  },
  shade: { opacity: 0.35 },
  /** The body's rounded top corners, drawn over the photo's bottom edge. */
  bottomBar: {
    height: theme.spacing[24],
    width: "100%",
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    position: "absolute",
    bottom: 0,
  }
});
