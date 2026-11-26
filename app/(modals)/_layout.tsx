import { SafeAreaView } from "@ui/safe-area-view";
import { Stack, useRouter } from "expo-router";
import { Platform, View } from "react-native";
import { theme } from "theme";
import { ButtonIcon } from "@ui/button-icon";
import { X } from "@ui/icons";
import { LinearGradient } from "expo-linear-gradient";

import { ModalActionButton } from "~/modules/navigation/modal-action";
import {
  MODAL_FRAME_BORDER_WIDTH,
  MODAL_GRABBER_HEIGHT,
  MODAL_GRABBER_MARGIN_BOTTOM,
  MODAL_GRABBER_MARGIN_TOP,
} from "~/modules/navigation/constants";
import { useIsModalSheetFullBleed, useModalSheetFrameHeight } from "~/modules/navigation/modal-sheet";

export default function ModalsLayout() {
  const router = useRouter();
  const isFullScreen = Platform.OS === "web";

  /**
   * An explicit height, not `flex: 1`. The sheet is presented `fitToContents`, which lays this tree
   * out with no bottom constraint so that the sheet can take its height from it — a flexed frame has
   * nothing to resolve against and collapses to its own borders. A number measures either way.
   */
  const frameHeight = useModalSheetFrameHeight();

  /**
   * A screen that opens on a picture (the sign-in) starts at the frame's top edge: no grabber takes
   * its strip, no border is drawn over the picture, and the fade that softens text scrolling under
   * the chrome would only wash the picture out.
   */
  const isFullBleed = useIsModalSheetFullBleed();

  return (
    <SafeAreaView
      edges={{ top: "off", bottom: "android" }}
      style={{
        flex: isFullScreen ? 1 : undefined,
        backgroundColor: theme.colors.background,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: isFullScreen ? undefined : frameHeight,
          overflow: "hidden",
          backgroundColor: theme.colors.background,
          // A picture runs to the frame's edge: a border there would draw a line over it.
          borderTopWidth: isFullScreen || isFullBleed ? 0 : MODAL_FRAME_BORDER_WIDTH,
          borderTopLeftRadius: isFullScreen ? 0 : 24,
          borderTopRightRadius: isFullScreen ? 0 : 24,
          borderBottomLeftRadius: isFullScreen ? 0 : Platform.OS === "ios" ? 24 : 0,
          borderBottomRightRadius: isFullScreen ? 0 : Platform.OS === "ios" ? 24 : 0,
          borderLeftWidth: Platform.OS === "ios" && !isFullBleed ? MODAL_FRAME_BORDER_WIDTH : 0,
          borderRightWidth: Platform.OS === "ios" && !isFullBleed ? MODAL_FRAME_BORDER_WIDTH : 0,
          borderBottomWidth: Platform.OS === "ios" ? MODAL_FRAME_BORDER_WIDTH : 0,
          borderColor: theme.colors.border.default,
          flex: isFullScreen ? 1 : undefined,
        }}>
        {!isFullBleed && <View style={{
          height: MODAL_GRABBER_HEIGHT,
          width: 86,
          borderRadius: theme.radius.full,
          backgroundColor: theme.colors.neutral.elevated,
          marginHorizontal: "auto",
          zIndex: 1,
          marginTop: MODAL_GRABBER_MARGIN_TOP,
          marginBottom: MODAL_GRABBER_MARGIN_BOTTOM,
        }}
        />}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: theme.colors.background,
              width: "100%",
            },
            animation: "slide_from_right",
          }}
        />
        {!isFullBleed && <LinearGradient
          colors={[theme.colors.background, theme.colors.transparent.light]}
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
        />}
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
        <ModalActionButton
          style={{
            position: "absolute",
            top: theme.spacing[16],
            right: theme.spacing[16],
            alignSelf: "flex-end"
          }}
        />
      </View>
    </SafeAreaView>
  )
}
