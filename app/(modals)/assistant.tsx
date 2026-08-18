import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet } from "react-native";
import { theme } from "~/global/theme";
import { AssistantScreen } from "~/modules/assistant/screen";
import { MODAL_MAX_DETENT } from "~/modules/navigation/constants";
import { useDeclaredModalSheet } from "~/modules/navigation/modal-sheet";
import { NavigationBar } from "~/modules/navigation/navigation-bar";

export default function Assistant() {
  /**
   * Declared, not measured: a conversation has no natural end, so it takes the tallest sheet and
   * scrolls inside it rather than asking to be cut to a height that keeps moving.
   */
  useDeclaredModalSheet(MODAL_MAX_DETENT);

  if (Platform.OS === "ios")
    return <>
      <AssistantScreen />
      <NavigationBar />
    </>;

  return <>
    <LinearGradient
      colors={[theme.colors.neutral.subtle, theme.colors.background]}
      style={StyleSheet.absoluteFill}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    />
    <AssistantScreen />
  </>
}
