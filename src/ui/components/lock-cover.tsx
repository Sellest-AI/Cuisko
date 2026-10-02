import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { theme } from "theme";
import { BlurView } from "./blur-view";
import { LockIcon } from "./icons";

type Props = {
  /** When true, the content is frosted over and a lock sits on top of it. */
  locked?: boolean;
  /** The covered content's corner radius, so the frost does not overhang it. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Frosted on iOS and web only. Android's blur needs a `BlurTarget`, and inside the week summary's
 * reveal it drew nothing, so Android fades the content almost out under a plain cover instead.
 */
const Cover = Platform.OS === "android" ? View : BlurView;

/**
 * A card the data does not exist for yet: still drawn, so its row keeps its shape, but covered
 * over with a lock in the middle.
 */
export const LockCover = ({ locked = false, radius = 0, style, children }: Props) => (
  <View style={style}>
    <View style={[styles.fill, locked && styles.faded]}>
      <View>{children}</View>
      {locked && <View style={[StyleSheet.absoluteFill, styles.shade, { borderRadius: radius }]} />}
    </View>
    {locked && (
      <Cover style={[StyleSheet.absoluteFill, styles.cover, { borderRadius: radius }]} tint="light" intensity={48}>
        <View style={styles.iconContainer}>
          <LockIcon color={theme.colors.neutral.muted} size={24} />
        </View>
      </Cover>
    )}
  </View>
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  faded: { opacity: Platform.select({ android: 0.05, default: 0.8 }) },
  shade: { backgroundColor: "rgba(0,0,0,0.05)" },
  cover: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  iconContainer: {
    padding: theme.spacing[12],
    backgroundColor: Platform.select({
      android: theme.colors.background,
      default: theme.colors.surface.elevated,
    }),
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    zIndex: 1,
  },
});
