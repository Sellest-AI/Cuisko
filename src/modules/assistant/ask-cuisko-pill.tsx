import { StyleSheet, View, type ViewStyle } from "react-native";

import { ButtonPill } from "@ui/button-pill";
import { Image } from "@ui/image";
import { CUISKO_HEAD } from "~/lib/mascots";

type Props = {
  /** The label, worded by the caller: the home shelf and the account drawer each own their copy. */
  children: string;
  onPress: () => void;
  size?: "sm" | "md";
  style?: ViewStyle;
};

/**
 * The way into the assistant: a pill that leads with Cuisko's head where the others lead with an
 * icon disc.
 *
 * One component because the head is not an icon: it is a picture sized and pulled into the pill's
 * padding by hand, and those numbers are the part two pasted copies drift on. Here, beside the
 * screen it opens, rather than in `src/ui/`, because the mascot is an app asset the design system
 * may not import (ADR 0002).
 */
export const AskCuiskoPill = ({ children, onPress, size = "md", style }: Props) => (
  <ButtonPill
    size={size}
    variant="neutral"
    onPress={onPress}
    style={style}
    leftContent={
      <View style={HEAD[size]}>
        <Image source={CUISKO_HEAD} style={styles.image} />
      </View>
    }
  >
    {children}
  </ButtonPill>
);

/**
 * The head per pill size. Larger than an icon disc and pulled into the pill's left padding with a
 * negative margin, so the face sits where a disc would without making the pill any taller.
 */
const HEAD = StyleSheet.create({
  sm: { width: 38, height: 38, padding: 5, marginLeft: -10, marginRight: -5 },
  md: { width: 44, height: 44, padding: 5, marginLeft: -10 },
});

const styles = StyleSheet.create({
  image: { width: "100%", height: "100%", objectFit: "contain" },
});
