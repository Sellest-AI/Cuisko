import { View, StyleSheet, ViewStyle } from "react-native";
import { theme } from "theme";
import { Image } from "./image";
import { ComponentProps } from "react";

type Props = {
  style?: ViewStyle,
  source: ComponentProps<typeof Image>["source"]
}

export const Avatar = ({ source, style }: Props) => {
  return (
    <View style={[styles.container, style]}>
      <Image
        source={source}
        style={styles.image}
        contentFit="cover"
      />
    </View>
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
