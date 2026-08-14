import { StyleSheet, View } from "react-native";

import { Image } from "@ui/image";
import { IconComponent } from "@ui/icons";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

import { MASCOT } from "../_hooks/placeholders";

type Props = {
  title: string;
  subtitle?: string;
  /** Replaces the mascot on the steps that report rather than ask. */
  icon?: IconComponent;
  tone?: "onTint" | "onLight";
};

const MASCOT_SIZE = 148;
const ICON_SIZE = 24;

/**
 * The question at the top of a tunnel step, and whoever is asking it.
 *
 * The mascot leads the two steps that ask the user for something, and steps back on the two that
 * show what came back — those open with the thing itself, which is the answer they came for.
 */
export const TunnelHeader = ({ title, subtitle, icon, tone = "onTint" }: Props) => {
  const Icon = icon;

  return (
    <View style={styles.container}>
      {Icon ? (
        <View style={styles.titleRow}>
          <Icon size={ICON_SIZE} color={colors.foreground} style={{ marginTop: 2 }} />
          <Text.H4>{title}</Text.H4>
        </View>
      ) : (
        <>
          <Image source={MASCOT} contentFit="contain" style={styles.mascot} />
          <Text.H4
            style={styles.title}
            color={tone === "onTint" ? colors.primary.foreground : colors.foreground}
          >
            {title}
          </Text.H4>
        </>
      )}
      {subtitle && (
        <Text.Lg color={colors.muted} style={styles.subtitle}>
          {subtitle}
        </Text.Lg>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginTop: theme.spacing[16],
    marginBottom: theme.spacing[32],
  },
  mascot: { width: MASCOT_SIZE, height: MASCOT_SIZE },
  title: {
    textAlign: "center",
    marginTop: theme.spacing[20],
    maxWidth: 220,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
  },
  subtitle: { marginTop: theme.spacing[6], textAlign: "center" },
});
