import { Blobatar } from "@blobatar/react-native";
import { AnimatedBlobatar } from "@blobatar/react-native/animated";
import { StyleSheet, View, ViewStyle } from "react-native";
import { theme } from "theme";
import { useIsMotionAllowed } from "@ui/hooks/useIsMotionAllowed";
import { Pressable } from "./pressable";

/** The ring, counted twice: the blobatar is drawn inside it rather than under it. */
const BORDER = 2;

const DEFAULT_SIZE = 40;

type Props = {
  /**
   * What the face is drawn from. Any stable string: the same seed always draws the same blobatar,
   * and two different seeds draw two different ones.
   *
   * Opaque on purpose — this layer neither knows nor cares that it is derived from a user id, which
   * is what lets it stay a plain string prop rather than an `Id<'users'>` (ADR 0002).
   */
  seed: string,
  size?: number,
  style?: ViewStyle,
  onPress?: () => void,
  elevated?: boolean,
  animated?: boolean,
  variant?: "ringed" | "bare";
}

/**
 * A cook's face.
 *
 * Generated rather than loaded: nothing in the product uploads an image, so every avatar drawn from
 * a source was the same grey placeholder. A blobatar is per-person from the first render, with no
 * upload, no empty state and no request.
 */
export const Avatar = ({ seed, size = DEFAULT_SIZE, style, elevated, animated = false, variant = "ringed", onPress }: Props) => {
  const Component = onPress ? Pressable : View;
  const isMotionAllowed = useIsMotionAllowed();

  /**
   * Sized to the content box rather than the border box. A blobatar draws to the number it is
   * given — the geometry is generated at that size, not scaled into a container — so passing the
   * full `size` would put the ring over the edge of the face instead of around it.
   */
  const face = variant === "bare" ? size : size - BORDER * 2;

  return (
    <Component
      /**
       * `style` before the size, so the size the caller passed as a prop always wins. The other
       * order lets a caller set `width` in `style` and resize the ring while the face stays at
       * `face` — the two are drawn from different numbers, so nothing makes them disagree loudly.
       */
      style={[
        styles.container,
        elevated && styles.elevated,
        variant === "ringed" && styles.ring,
        style,
        { width: size, height: size }
      ]}
      onPress={onPress}
    >
      {/*
        * The idle loop is the caller's to gate: the library says so, and nothing below it reads the
        * OS setting. A face that never stops moving is the thing "reduce motion" is turned on to
        * stop, and this one sits on the first screen of the app. An old device is spared it too.
        */}
      {(!isMotionAllowed || !animated)
        ? <Blobatar name={seed} size={face} />
        : <AnimatedBlobatar name={seed} size={face} animate />}
    </Component>
  )
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  ring: {
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface.elevatedSubtle,
    borderWidth: BORDER,
    borderColor: theme.colors.border.default,
  },
  elevated: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 32,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.04)",
      },
    ],
  }
})
