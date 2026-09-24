import { Platform, StyleSheet, Text as NativeText, View } from "react-native";

import { Image } from "@ui/image";

type Props = {
  /** The picture. Absent, or while there is none, `emoji` stands in. */
  uri?: string;
  emoji: string;
  size?: number;
};

/**
 * A small picture set into a line of text, flowing with the words around it. Drawn *inside* a
 * `Text.*`, like `RichText`.
 *
 * Decorative: the words beside it already say what it shows, so a screen reader skips it rather
 * than announcing the same ingredient twice.
 *
 * Carries no spacing of its own: which side needs a space depends on where the caller sets it.
 */
export const InlineImage = ({ uri, emoji, size = 14 }: Props) => (
  <>
    {uri ? (
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.frame, { width: size, height: size }]}
      >
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="contain" />
      </View>
    ) : (
      <NativeText accessible={false} style={{ fontSize: size }}>{emoji}</NativeText>
    )}
  </>
);

const styles = StyleSheet.create({
  /**
   * A view inside text sits on the baseline, which leaves a picture shorter than the line looking
   * as if it had slipped upward. Nudged onto the middle of the lowercase letters instead; the web
   * has a property for exactly that.
   */
  frame: Platform.select({
    web: { verticalAlign: "middle" },
    default: { transform: [{ translateY: 2 }] },
  }),
});
