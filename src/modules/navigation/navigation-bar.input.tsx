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
import { pickQuantity, type Unit } from "@shared/ingredients";
import { useSuggestions } from "./_hooks/useSuggestions";
import { useNavigationBar } from "./_hooks/useNavigationBar";
import { useStockActions, usePendingIngredients } from "~/modules/groceries/hooks";
import { usePathname, router } from "expo-router";
import { readIntent } from "@shared/ingredientIntent";
import type { AssistantMode } from "./_hooks/useNavigationBar";

const MIC_ICON_SIZE = 20;

/**
 * What a submission does to stock, decided by the mode the bar is in.
 *
 * "cellar" means the shopper is telling us what they own, so it goes in. Every other mode — the
 * list, a recipe, or no mode at all — means they are writing something down to buy.
 *
 * Named rather than inlined because two submissions now need it: an ingredient the catalog already
 * holds, and one the resolver had to go and find. They must agree, or the same word typed twice
 * lands in two different places depending on whether we happened to know it.
 *
 * The return type is inferred rather than imported: `Intent` lives in the groceries module's
 * `_model/`, which is its interior (lint R8), and the literal union is what `apply` accepts.
 */
const _stockIntent = (mode: AssistantMode) => (mode === "cellar" ? ("buy" as const) : ("relist" as const));

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

  const { hasSuggestions, matchingSuggestion, rest, unit, amount } = useSuggestions(value);
  const showSuggestions = focused && hasSuggestions;

  const { apply } = useStockActions();
  const { add: addUnknown } = usePendingIngredients();

  const { mode, setInputRef } = useNavigationBar();
  const ref = useRef<TextInput>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setInputRef(ref); }, []);

  const showGroceries = () => {
    if (!pathname.startsWith("/groceries")) router.push("/groceries");
  }

  const submitSuggestion = (suggestionId: string, unit: Unit, amount: number) => {
    // Deliberately not awaited: `apply` handles its own failure, and the bar closes on the
    // gesture rather than on the write landing — Convex reflects the row when it does.
    void apply(_stockIntent(mode), { ingredientId: suggestionId, unit: unit }, Number(amount));
    showGroceries();
  }

  /**
   * A word the catalog does not hold, handed to the resolver with a placeholder standing in for it.
   *
   * Also not awaited, and for a stronger reason than above: the resolve can take seconds, and the
   * bar has to close on the gesture. The ghost is what carries the wait — `usePendingIngredients`
   * puts it up before the request goes out and owns everything that happens to it after.
   *
   * `rest` and not `value`: the resolver is asked about the food, with the quantity taken out, so
   * "500g yuzu" does not go to a dictionary as "500g yuzu".
   */
  const submitUnknown = (text: string, unit: Unit | null, amount: number | null) => {
    void addUnknown(text, _stockIntent(mode), unit, amount);
    showGroceries();
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
              setValue("");
              onBlur?.();
              ref.current?.blur();

              // Delay the submission to allow the blur animation to complete before navigating away.
              setTimeout(() => {
                submitSuggestion(suggestion.id, suggestion.unit, suggestion.amount);
              }, 200);
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
            /**
             * Three things Enter can mean, and they are no longer decided by whether the catalog
             * happened to answer. `readIntent` owns the rules and their order — an explicit
             * question beats a match, a match beats the sentence heuristic — so that "? tomate"
             * asks about tomatoes instead of buying one, and a food we have never held reaches the
             * resolver instead of the assistant's mockup.
             */
            const intent = readIntent(value, matchingSuggestion !== null);

            // The row answers when the shopper did not, both halves together — an amount without
            // its unit is not half a quantity. On the unknown branch there is no row yet, so the
            // blank travels, and `usePendingIngredients` fills it the same way from what the
            // resolver comes back with.
            if (intent.kind === "ingredient" && matchingSuggestion) {
              const quantity = pickQuantity({ amount, unit }, matchingSuggestion);
              submitSuggestion(matchingSuggestion.id, quantity.unit, quantity.amount);
            }
            else if (intent.kind === "unknown" && rest)
              submitUnknown(rest, unit, amount);
            else if (intent.kind === "chat")
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
    overflow: "hidden",
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
