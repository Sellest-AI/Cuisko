import { StyleSheet, View, ViewStyle } from "react-native";
import { theme } from "theme";
import { Image } from "./image";
import { ComponentProps } from "react";
import { Pressable } from "./pressable";

type Props = {
  style?: ViewStyle,
  source: ComponentProps<typeof Image>["source"],
  onPress?: () => void,
}

export const Avatar = ({ source, style, onPress }: Props) => {
  const Component = onPress ? Pressable : View;

  return (
    <Component
      style={[styles.container, style]}
      onPress={onPress}
    >
      <Image
        source={source}
        style={styles.image}
        contentFit="cover"
      />
    </Component>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.border.default,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  }
})
