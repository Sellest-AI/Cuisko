import { ComponentProps } from "react";
import { Platform } from "react-native";
import { SafeAreaView as SafeAreaViewNative } from "react-native-safe-area-context";

export { KeyboardAvoidingView } from "react-native";
export { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

export type Edge = "top" | "right" | "bottom" | "left";
export type EdgeMode = "off" | "additive" | "maximum";
export type EdgeModeExtended = EdgeMode | "android";
export type EdgeRecord = Partial<Record<Edge, EdgeModeExtended>>;

const edge = (mode?: EdgeModeExtended): EdgeMode => {
  if (mode === "android") {
    if (Platform.OS === "android") return "additive";
    return "off";
  }
  return mode ?? "additive";
}

type Props = Omit<ComponentProps<typeof SafeAreaViewNative>, "edges"> & {
  edges?: EdgeRecord;
};

export const SafeAreaView = ({ children, edges, ...props }: Props) => {
  return (
    <SafeAreaViewNative
      edges={{
        top: edge(edges?.top),
        left: edge(edges?.left),
        right: edge(edges?.right),
        bottom: edge(edges?.bottom),
      }}
      {...props}
    >
      {children}
    </SafeAreaViewNative>
  )
}
