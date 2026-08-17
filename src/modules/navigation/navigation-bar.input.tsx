import { View, StyleSheet, ViewStyle, Platform } from "react-native";
import { Input, type TextInput } from "@ui/input";
import { Camera, MicIcon } from "@ui/icons";
import { theme } from "theme";
import { useTranslations } from "translations";
import { useEffect, useRef, useState } from "react";
import { NAVIGATION_BAR_HEIGHT } from "./constants";
import { AnimatePresence, m } from "@ui/motion";
import { BlurView } from "~/ui/components/blur-view";
import { Suggestions } from "./_components/suggestions";
import { Unit, useSuggestions } from "./_hooks/useSuggestions";
import { useNavigationBar } from "./_hooks/useNavigationBar";
import { useStockActions } from "~/modules/groceries/hooks";
import { usePathname, router } from "expo-router";

const MIC_ICON_SIZE = 20;

type Props = {
  style?: ViewStyle,
  /** Controlled by the parent: it stays true while a suggestion is being tapped, and only goes
   * false when the parent detects a tap outside the whole navigation bar. */
  focused: boolean,
  onFocus: () => void,
  onBlur?: () => void,
}

export const NavigationBarInput = ({ style, focused, onFocus, onBlur }: Props) => {
  const t = useTranslations("Navigation");
  const pathname = usePathname();

  const [value, setValue] = useState("");

  const { hasSuggestions, matchingSuggestion, unit, amount } = useSuggestions(value);
  const showSuggestions = focused && hasSuggestions;

  const { apply } = useStockActions();

  const { mode, setInputRef } = useNavigationBar();
  const ref = useRef<TextInput>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setInputRef(ref); }, []);

  const submitSuggestion = (suggestionId: string, unit: Unit, amount: number) => {
    /**
     * The type of action to apply depends on the current mode of the navigation bar.
     * If the mode is "cellar", we want to "buy" the ingredient.
     * If the mode is "shopping-list", we want to "relist" it. Otherwise, we default to "relist".
     */
    const type = mode === "cellar" ? "buy" : mode === "shopping-list" ? "relist" : "relist";
    apply(type, { ingredientId: suggestionId, unit: unit }, Number(amount));
    if (!pathname.startsWith("/groceries")) router.push("/groceries");
  }

  return (
    <View style={[
      focused && { maxWidth: "100%", width: "100%", paddingHorizontal: theme.spacing[16] },
      style]}>
      <AnimatePresence>
        {showSuggestions && <m.View
          from={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          exitTransition={{ duration: 100 }}
          transition={{ duration: 0.2 }}
          style={[
            styles.suggestionsContainer,
            styles.suggestionsContainerRadius,
            styles.elevated,
            { transformOrigin: "bottom" },
            focused && { left: 10, right: 10 }
          ]}>
          <BlurView
            tint="light"
            style={[
              StyleSheet.absoluteFill,
              styles.suggestionsContainerRadius,
              {
                borderWidth: 3,
                borderColor: theme.colors.border.default,
                backgroundColor: theme.colors.surface.elevated,
              }
            ]}
          />
          <Suggestions
            value={value}
            style={{ paddingTop: theme.spacing[16] }}
            onSelect={(suggestion) => {
              submitSuggestion(suggestion.id, suggestion.unit, suggestion.amount);
              setValue("");
              onBlur?.();
            }}
          />
        </m.View>}
      </AnimatePresence>
      <m.View
        style={[
          styles.container,
          focused ? { maxWidth: "100%", width: "100%" } : { maxWidth: 242, width: "100%" },
        ]}>
        <Input
          ref={ref}
          elevated
          placeholder={t("ask_anything").slice(0, 15).trim().concat("…")}
          leftIcon={Camera}
          onLeftPress={() => console.log("camera pressed")}
          rightContent={<MicIcon size={MIC_ICON_SIZE} color={theme.colors.foreground} />}
          style={{ width: "100%" }}
          onSubmit={() => {
            if (matchingSuggestion)
              submitSuggestion(matchingSuggestion.id, unit, amount);
            else
              router.push("/assistant");

            setValue("");
            // Blurs the way selecting a suggestion already does. The Input's own onBlur is
            // web-only, so without this the bar keeps its mode for the next submission and the
            // dismiss overlay stays mounted over the screen just pushed.
            onBlur?.();
          }}
          value={value}
          onChangeText={(text) => setValue(text)}
          onFocus={onFocus}
          onBlur={() => Platform.OS === "web" && onBlur?.()}
        />
      </m.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
  },
  suggestionsContainer: {
    position: "absolute",
    bottom: -theme.spacing[6],
    left: -theme.spacing[6],
    right: -theme.spacing[6],
    paddingBottom: NAVIGATION_BAR_HEIGHT,
  },
  suggestionsContainerRadius: {
    borderRadius: theme.radius.lg,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  elevated: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 6,
        blurRadius: 32,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  }
})
