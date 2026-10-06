import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import { theme } from "~/global/theme";
import { useCuiskoContext } from "~/modules/assistant/hooks";
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

  /**
   * The question the navigation bar was holding when it decided this screen should answer it.
   *
   * A route param rather than shared state, because it belongs to this opening of the modal and
   * nothing else — an atom would still be holding yesterday's question the next time the assistant
   * is opened from anywhere. Expo gives a repeated param as an array; only one is ever sent.
   */
  const { q, recipeId, step, servings } = useLocalSearchParams<{
    q?: string | string[];
    recipeId?: string | string[];
    step?: string | string[];
    servings?: string | string[];
  }>();
  const question = Array.isArray(q) ? q[0] : q;

  /**
   * The recipe the question was asked from, when the cooking screen opened this: held for every
   * question asked here, the bar's follow-ups included, and forgotten when the modal closes.
   */
  useCuiskoContext({ recipeId, step, servings });

  if (Platform.OS === "ios")
    return <>
      <AssistantScreen question={question} />
      <NavigationBar />
    </>;

  return <>
    <LinearGradient
      colors={[theme.colors.neutral.subtle, theme.colors.background]}
      style={[{ opacity: 0.5 }, StyleSheet.absoluteFill]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    />
    <AssistantScreen question={question} />
  </>
}
