import { StyleSheet, View } from "react-native";

import { RadialGradient } from "@ui/radial-gradient";
import { Image, type ImageProps } from "@ui/image";
import { IconComponent } from "@ui/icons";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

import { CUISKO } from "~/lib/mascots";

type Props = {
  title: string;
  subtitle?: string;
  /**
   * Which Cuisko asks this one — `CUISKO.calendar`, `CUISKO.forbidden`.
   *
   * Defaults to `CUISKO.idle`, the pose that is holding nothing: a step that has not chosen a
   * face still gets Cuisko rather than a 148px hole, and the empty hands say nothing the step
   * has not earned.
   *
   * Passed in rather than picked here from the step's name, so the header stays a header: the
   * step owns the question and the face that asks it, and a mapping living in this file would be
   * a second place to edit every time a step is added, renamed or reordered.
   */
  mascot?: ImageProps["source"];
  /** Replaces the mascot on the steps that report rather than ask. */
  icon?: IconComponent;
  tone?: "onTint" | "onLight";
};

const MASCOT_SIZE = 148;
const ICON_SIZE = 24;

/**
 * The question at the top of a tunnel step, and whoever is asking it.
 *
 * Cuisko leads every step that asks the user for something, and steps back on the ones that report
 * what came back — those open with an icon and the thing itself, which is the answer they came for.
 * Which pose asks which question is the step's own decision; see `mascot` below.
 */
export const TunnelHeader = ({ title, subtitle, mascot = CUISKO.idle, icon, tone = "onTint" }: Props) => {
  const Icon = icon;

  return (
    <View style={styles.container}>
      {Icon ? (
        <View style={styles.titleRow}>
          <Icon size={ICON_SIZE} color={colors.foreground} style={{ marginTop: 0 }} strokeWidth={theme.icon.titleStrokeWidth} />
          <Text.H4>{title}</Text.H4>
        </View>
      ) : (
        <>
          <RadialGradient
            colors={["rgb(0, 0, 0)", colors.primary.subtle]}
            size={MASCOT_SIZE * 1.1}
            style={{
              position: "absolute",
              top: MASCOT_SIZE / 2.4,
              transform: [{ scaleY: 1 / 4 }],
              opacity: 0.15
            }}
          />
          <Image source={mascot} contentFit="contain" style={styles.mascot} />
          <Text.H4
            style={{ ...styles.title, textBalance: true }}
            color={tone === "onTint" ? colors.primary.base : colors.foreground}
          >
            {title}
          </Text.H4>
        </>
      )}
      {subtitle && (
        <Text.Lg
          color={colors.muted}
          style={{ ...styles.subtitle, textBalance: true }}
        >
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
  subtitle: {
    marginTop: theme.spacing[8],
    textAlign: "center",
    maxWidth: 280,
  },
});
