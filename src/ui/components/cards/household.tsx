import { StyleSheet, TextStyle, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "theme";

import { Avatar } from "../avatar";
import { ButtonIcon } from "../button-icon";
import { LogOut } from "../icons";
import { Pressable } from "../pressable";
import { Text } from "../text";

type Props = {
  name: string;
  /** The code another cook types to join. Drawn faded: it is there to be shared, not read. */
  code: string;
  /** One opaque seed per member, in the order they should be drawn. */
  memberSeeds: string[];
  /**
   * Up to four pictures scattered along the right edge. Strings rather than image sources because
   * they are emoji today; the slots are fixed, so a fifth is ignored rather than piled on.
   */
  decorations?: string[];
  /** The household the app is shopping for, drawn filled. Every other one sits flat. */
  isCurrent?: boolean;
  onPress?: () => void;
  onCodePress?: () => void;
  /** Omitted, the exit disc is not drawn at all — the caller decides who may leave from here. */
  onLeave?: () => void;
  style?: ViewStyle;
};

const MEMBER_SIZE = 28;

/**
 * Where each decoration sits, as offsets from the card's right edge. Fixed rather than random, so
 * a card does not rearrange itself on every render.
 */
const SLOTS: TextStyle[] = [
  { top: 8, right: 72, transform: [{ rotate: "-12deg" }] },
  { top: 24, right: 0, transform: [{ rotate: "18deg" }] },
  { bottom: 8, right: 96, transform: [{ rotate: "-24deg" }] },
  { bottom: -10, right: 32, transform: [{ rotate: "10deg" }] },
];

/** A household: its name, the code that lets someone in, and who is already there. */
export const Household = ({
  name,
  code,
  memberSeeds,
  decorations = [],
  isCurrent = false,
  onPress,
  onCodePress,
  onLeave,
  style,
}: Props) => (
  <Pressable
    onPress={onPress}
    style={[styles.container, isCurrent ? styles.current : styles.other, style]}
  >
    {isCurrent && (
      <LinearGradient
        colors={[theme.colors.primary.base, theme.colors.primary.elevated]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    )}
    {decorations.slice(0, SLOTS.length).map((decoration, index) => (
      <Text.H4 key={index} style={{ ...styles.decoration, ...SLOTS[index], opacity: isCurrent ? 1 : 0.5 }}>
        {decoration}
      </Text.H4>
    ))}
    {onLeave && <LinearGradient
      colors={[theme.colors.transparent.light, theme.colors.neutral.subtle]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[StyleSheet.absoluteFill, { left: "auto", width: "50%", opacity: 0.8 }]}
    />}
    <View style={styles.heading}>
      <Text.H4
        color={isCurrent ? theme.colors.primary.foreground : theme.colors.neutral.muted}
        numberOfLines={1}
        style={styles.name}
      >
        {name}
      </Text.H4>
      <Pressable onPress={onCodePress} disabled={!onCodePress} style={styles.code}>
        <Text.Lg color={isCurrent ? theme.colors.primary.subtle : theme.colors.neutral.elevated}>
          {code}
        </Text.Lg>
      </Pressable>
    </View>
    <View style={[styles.members, { opacity: isCurrent ? 1 : 0.7 }]}>
      {memberSeeds.map((seed) => (
        <Avatar key={seed} seed={seed} size={MEMBER_SIZE} animated={false} />
      ))}
    </View>
    {onLeave && (
      <ButtonIcon
        variant="danger"
        size="sm"
        onPress={onLeave}
        style={styles.leave}
      >
        {LogOut}
      </ButtonIcon>
    )}
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    height: 132,
    padding: theme.spacing[16],
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  current: {
    borderColor: theme.colors.primary.elevated,
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 6,
        blurRadius: 32,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.1)",
      },
    ],
  },
  other: {
    backgroundColor: theme.colors.neutral.subtle,
    borderColor: theme.colors.border.dark,
  },
  heading: {
    alignItems: "flex-start",
    gap: theme.spacing[4],
    /** Leaves the right side to the decorations and the exit disc. */
    paddingRight: 96,
  },
  /**
   * Takes 18px of the column while its line box stays 28: a negative margin, not a `height`. The
   * H4 clips to its own box once `numberOfLines` is set, so a short box cuts the descenders off;
   * pulling the next row up instead lets them hang over it.
   */
  name: { fontSize: 22, lineHeight: 28, marginBottom: -4 },
  code: { alignSelf: "flex-start" },
  members: {
    flexDirection: "row",
    gap: theme.spacing[4],
  },
  decoration: {
    position: "absolute",
    fontSize: 40,
    lineHeight: 48,
  },
  leave: {
    position: "absolute",
    top: theme.spacing[12],
    right: theme.spacing[12],
  },
});
