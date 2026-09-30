import { Platform, StyleSheet, Text as TextNative, TextStyle, View } from "react-native";
import { theme } from "theme";
import { H4_NATURAL_LINE_HEIGHT_RATIO } from "fonts";

export { Text as TextNative } from "react-native";

type Props = {
  className?: string;
  color?: string,
  weight?: 700 | 600 | 500 | 400;
  children?: React.ReactNode;
  style?: TextStyle & {
    textBalance?: boolean;
  };
} & Omit<TextNative["props"], "style">;

const Texts = theme.font;

const NativeText = ({ ...props }: TextNative["props"]) => {
  if (Platform.OS === "web") return <TextNative {...props} />;

  const style = StyleSheet.flatten(props.style);

  const spaceLeft = style?.paddingLeft || style?.paddingHorizontal || style?.paddingInlineStart || style?.marginLeft || style?.marginHorizontal || style?.marginInlineStart;
  const spaceRight = style?.paddingRight || style?.paddingHorizontal || style?.paddingInlineEnd || style?.marginRight || style?.marginHorizontal || style?.marginInlineEnd;

  const hasSpace = spaceLeft || spaceRight;

  if (hasSpace) {
    return <>
      {spaceLeft && <View style={{ width: spaceLeft }} />}
      <TextNative {...props} />
      {spaceRight && <View style={{ width: spaceRight }} />}
    </>
  }

  return <TextNative {...props} />
}

export const Text = () => {
  throw new Error("Text is a namespace and cannot be used as a component. Use Text.H4, Text.Lg, Text.Base, or Text.Sm instead.");
}

/**
 * The one step on the scale with no `weight` prop, because it is the one set in a display face.
 *
 * A loaded face carries its weight in the file, and is registered at normal weight only. Asking it
 * for any other weight does not fall back gracefully: Android finds no face in that slot and
 * renders the system font, which reads as "the font failed to load" (`H4_FONT_WEIGHT` in
 * `src/global/fonts.ts` has the whole path). So `theme.font.h4` sets the weight, and the prop is
 * absent rather than ignored: a call site asking for one is a type error here instead of a
 * rendering mystery on a device.
 */
type H4Props = Omit<Props, "weight">;

/**
 * How far to move the letters down so they sit centred in a line box shorter than the face's own
 * (`H4_NATURAL_LINE_HEIGHT_RATIO` has why). A transform, so it moves what is drawn and nothing
 * else: the box, the gaps around it and the spacing between wrapped lines are all untouched.
 *
 * From the final size and leading, so a call site that overrides either still gets the right
 * shift, and one that gives the face its full line gets none.
 *
 * iOS only: that is where the trimmed space comes off the top of the line.
 */
const _h4Recentre = (fontSize: number, lineHeight: number) => {
  if (Platform.OS !== "ios") return {};
  const trimmed = fontSize * H4_NATURAL_LINE_HEIGHT_RATIO - lineHeight;
  return trimmed > 0 ? { transform: [{ translateY: trimmed / 2 }] } : {};
};

const H4 = ({ children, color, className, style, ...props }: H4Props) => {
  const textBreakProps = style?.textBalance ? {
    textBreakStrategy: "balanced" as const,
    lineBreakStrategyIOS: Platform.OS === "ios" ? "push-out" as const : undefined,
  } : {};
  const overflow = props.numberOfLines ? "hidden" : undefined;
  const fontSize = style?.fontSize ?? Texts.h4.fontSize;
  const recentre = _h4Recentre(fontSize, style?.lineHeight ?? Texts.h4.lineHeight);

  return (
    <NativeText
      style={{ ...Texts.h4, color, ...styles.shared, overflow, ...recentre, ...style }}
      {...props}
      {...textBreakProps}
    >
      {children}
    </NativeText>
  )
}

const Lg = ({ children, color, weight, className, style, ...props }: Props) => {
  const textBreakProps = style?.textBalance ? {
    textBreakStrategy: "balanced" as const,
    lineBreakStrategyIOS: Platform.OS === "ios" ? "push-out" as const : undefined,
  } : {};

  const fontWeight = weight ? { fontWeight: weight } : {};
  const overflow = props.numberOfLines ? "hidden" : undefined;

  return (
    <NativeText
      style={{ ...Texts.lg, ...fontWeight, color, ...styles.shared, overflow, ...style }}
      {...props}
      {...textBreakProps}
    >
      {children}
    </NativeText>
  )
}

const Body = ({ style, ...props }: Props) => {
  return <Base style={{ lineHeight: Texts.base.lineHeight * 1.1, fontWeight: 400, ...style }} {...props} />
}

const Base = ({ children, color, weight, className, style, ...props }: Props) => {
  const textBreakProps = style?.textBalance ? {
    textBreakStrategy: "balanced" as const,
    lineBreakStrategyIOS: Platform.OS === "ios" ? "push-out" as const : undefined,
  } : {};

  const fontWeight = weight ? { fontWeight: weight } : {};
  const overflow = props.numberOfLines ? "hidden" : undefined;

  return (
    <NativeText
      style={{ ...Texts.base, ...fontWeight, color, ...styles.shared, overflow, ...style }}
      {...props}
      {...textBreakProps}
    >
      {children}
    </NativeText>
  )
}

const Sm = ({ children, color, weight, className, style, ...props }: Props) => {
  const textBreakProps = style?.textBalance ? {
    textBreakStrategy: "balanced" as const,
    lineBreakStrategyIOS: Platform.OS === "ios" ? "push-out" as const : undefined,
  } : {};

  const fontWeight = weight ? { fontWeight: weight } : {};
  const overflow = props.numberOfLines ? "hidden" : undefined;

  return (
    <NativeText
      style={{ ...Texts.sm, ...fontWeight, color, ...styles.shared, overflow, ...style }}
      {...props}
      {...textBreakProps}
    >
      {children}
    </NativeText>
  )
}

const styles = StyleSheet.create({
  shared: {
    overflow: "visible",
  }
})

Text.H4 = H4;
Text.Lg = Lg;
Text.Base = Base;
Text.Body = Body;
Text.Sm = Sm;
