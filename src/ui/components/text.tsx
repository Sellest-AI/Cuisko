import { Platform, StyleSheet, Text as TextNative, TextStyle, View } from "react-native";
import { theme } from "theme";

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

const H4 = ({ children, color, weight, className, style, ...props }: Props) => {
  const textBreakProps = style?.textBalance ? {
    textBreakStrategy: "balanced" as const,
    lineBreakStrategyIOS: Platform.OS === "ios" ? "push-out" as const : undefined,
  } : {};
  const fontWeight = weight ? { fontWeight: weight } : {};
  const overflow = props.numberOfLines ? "hidden" : undefined;

  return (
    <NativeText
      style={{ ...Texts.h4, ...fontWeight, color, ...styles.shared, overflow, ...style }}
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
Text.Sm = Sm;
