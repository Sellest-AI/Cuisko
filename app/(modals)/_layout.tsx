import { SafeAreaView } from "@ui/safe-area-view";
import { Stack, useRouter } from "expo-router";
import { Platform, View } from "react-native";
import { theme } from "theme";
import { ButtonIcon } from "@ui/button-icon";
import { X } from "@ui/icons";
import { LinearGradient } from "expo-linear-gradient";

export default function ModalsLayout() {
  const router = useRouter();
  const isFullScreen = Platform.OS === "web";

  return (
    <SafeAreaView
      edges={{ top: "off", bottom: "android" }}
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        overflow: "hidden",
      }}
    >
      <View style={{
        overflow: "hidden",
        backgroundColor: theme.colors.background,
        borderTopWidth: isFullScreen ? 0 : 2,
        borderTopLeftRadius: isFullScreen ? 0 : 28,
        borderTopRightRadius: isFullScreen ? 0 : 28,
        borderBottomLeftRadius: isFullScreen ? 0 : Platform.OS === "ios" ? 28 : 0,
        borderBottomRightRadius: isFullScreen ? 0 : Platform.OS === "ios" ? 28 : 0,
        borderLeftWidth: Platform.OS === "ios" ? 2 : 0,
        borderRightWidth: Platform.OS === "ios" ? 2 : 0,
        borderBottomWidth: Platform.OS === "ios" ? 2 : 0,
        borderColor: theme.colors.border.default,
        flex: 1,
      }}>
        <View style={{
          height: 6,
          width: 86,
          borderRadius: theme.radius.full,
          backgroundColor: theme.colors.neutral.elevated,
          marginHorizontal: "auto",
          marginTop: theme.spacing[16],
          zIndex: 1,
        }}
        />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: "transparent",
              width: "100%",
            },
            animation: "slide_from_right",
          }}
        />
        <LinearGradient
          colors={[theme.colors.background, "transparent"]}
          style={{
            pointerEvents: "none",
            position: "absolute",
            top: 26,
            left: 0,
            right: 0,
            height: 32,
          }}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
        <ButtonIcon
          elevated
          variant="neutral-inverted"
          onPress={() => router.back()}
          style={{
            position: "absolute",
            top: theme.spacing[16],
            left: theme.spacing[16],
          }}
        >
          {X}
        </ButtonIcon>
      </View>
    </SafeAreaView>
  )
}
