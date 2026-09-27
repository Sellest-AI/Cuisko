import { Platform, Pressable, StyleSheet } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ButtonIcon } from "@ui/button-icon";
import { ArrowLeft, ForkKnife, House, Plus } from "@ui/icons";
import { theme } from "theme";
import { router, usePathname } from "expo-router";
import { m, AnimatePresence } from "@ui/motion";
import { NAVIGATION_BAR_OFFSET } from "../constants";
import { useRef, useState } from "react";
import { NavigationBarInput } from "./input";
import { NavigationBarVoice } from "./voice";
import { useNavigationBar } from "../hooks";
import { useBackLeadsHome } from "../_hooks/useBackLeadsHome";
import { ButtonPill } from "@ui/button-pill";
import { useTranslations } from "translations";
import { SafeAreaView } from "~/ui/components/safe-area-view";

const INITIAL_DELAY = 50;

const sharedTransition = (width?: number) => ({
  from: { opacity: 1, width: width ? 0 : undefined, translateY: NAVIGATION_BAR_OFFSET },
  animate: { opacity: 1, width, translateY: 0 },
  exit: { opacity: 0, width: width ? 0 : undefined, translateY: NAVIGATION_BAR_OFFSET },
  transition: { delay: INITIAL_DELAY + 50 },
  exitTransition: { delay: 0, duration: 150 },
})

/**
 * The bar that floats over every page: ask Cuisko anything, or go straight to cooking.
 *
 * It lives in its own module rather than in `home/` because it is not part of any one page — a
 * route renders it beside its screen, and the screen it sits over knows nothing about it. That
 * independence is also what lets it keep animation state across a navigation later.
 *
 * A sibling of the page rather than a child, so it stays put while the page scrolls. Whatever
 * renders it is responsible for leaving room at the bottom of the scroll.
 */
export const NavigationBar = () => {
  const t = useTranslations("Navigation");

  const path = usePathname();
  const isHome = path === "/";
  const isGroceries = path.startsWith("/groceries");
  const isAssistant = path.startsWith("/assistant");
  const isRecipes = path.startsWith("/recipes");
  const isPlanning = path === "/planning";

  const hasNavigationBar = isHome || isGroceries || isAssistant || isPlanning || isRecipes;
  const backLeadsHome = useBackLeadsHome();

  const [inputFocused, setInputFocused] = useState(false);

  const insets = useSafeAreaInsets();
  const { reset, blur } = useNavigationBar();

  /**
   * Which bar is up: the text field, or the voice bar that listens. Two components that never talk
   * to each other — this is the only place that knows both, and the only thing that crosses from
   * one to the other is `heard`.
   */
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");

  /**
   * A page without the bar ends a spoken entry — the voice bar unmounts, and unmounting is what
   * stops the recognizer. The mode goes with it: kept at "voice", the bar would open listening the
   * next time a page shows it, without anyone having pressed the mic. Set during render rather than
   * in an effect, so no frame ever draws the voice bar on the way back.
   */
  if (inputMode === "voice" && (!hasNavigationBar || isRecipes)) setInputMode("text");

  /**
   * What the voice bar heard, handed to the text bar as it comes back. `undefined` whenever the
   * text bar is not returning from a spoken entry, so an old one is never typed in again.
   */
  const [heard, setHeard] = useState<string>();

  const cancelResetRef = useRef(() => { });
  const onFocus = () => {
    setInputFocused(true);
    cancelResetRef.current();
  }

  /**
   * Leaving the bar also leaves the voice bar: the tap outside is the shopper walking off, not
   * asking for what they half-said to be typed in behind them. Unmounting it is what stops the
   * recognizer.
   */
  const onBlur = () => {
    // The field's native focus is not React's: collapsing the bar leaves the keyboard standing
    // unless the input is asked to give it up, and the shopper then has to tap outside twice.
    blur();
    setInputFocused(false);
    setInputMode("text");
    setHeard(undefined);
    // Store the reset function timeout to cancel it on focus
    cancelResetRef.current = reset({ delayed: true });
  }

  /** The mic: full width for the wave, and the voice bar in the text bar's place. */
  const onVoice = () => {
    onFocus();
    setHeard(undefined);
    setInputMode("voice");
  }

  const onHeard = (text: string) => {
    setHeard(text);
    setInputMode("text");
  }

  return (
    <>
      {hasNavigationBar && inputFocused && Platform.OS !== "web" && (
        // Sits below the bar in z-order (rendered first) so it only ever catches taps outside
        // the bar and its suggestions dropdown — a tap inside them never reaches the input's
        // native onBlur before the press registers.
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => onBlur()}
        />
      )}
      {/*
        * `KeyboardProvider` only publishes where the keyboard is — something has to consume it.
        * The bar is pinned to the bottom of the window, so without this it sits *under* the
        * keyboard the moment its own input takes focus. The sticky view lifts it by the keyboard
        * height, driven by the same frames as the system animation rather than by a JS listener.
        *
        * The bar is positioned here rather than on the animated child, so the lift applies to the
        * whole bar and the child keeps its own enter/exit translateY unclaimed.
        *
        * `opened` gives back the home-indicator inset: the keyboard's height already spans it, so
        * without it the gap above the keys is the inset plus the bar's own padding.
        */}
      <KeyboardStickyView
        style={[styles.sticky, { pointerEvents: hasNavigationBar ? "auto" : "none" }]}
        offset={{ closed: 0, opened: insets.bottom - Platform.select({ ios: 24, default: 4 }) }}
      >
        <AnimatePresence>
          {hasNavigationBar && (
            <m.View
              style={styles.container}
              {...sharedTransition()}
              transition={{ delay: INITIAL_DELAY }}
            >
              <SafeAreaView edges={{ bottom: "android", top: "off" }} style={styles.flex}>
                <AnimatePresence>
                  {(!isHome && !inputFocused && !isAssistant) &&
                    <m.View {...sharedTransition(54)}>
                      <ButtonIcon
                        elevated
                        variant="neutral-inverted"
                        onPress={() => router.canGoBack() ? router.back() : router.dismissTo("/")}
                        style={{ alignSelf: "auto" }}
                        size="lg"
                      >
                        {backLeadsHome ? House : ArrowLeft}
                      </ButtonIcon>
                    </m.View>}
                </AnimatePresence>
                {!isRecipes && inputMode === "text" && <NavigationBarInput
                  style={{ maxWidth: inputFocused ? "100%" : (isAssistant ? 320 : 242) }}
                  focused={inputFocused}
                  onFocus={onFocus}
                  onBlur={() => onBlur()}
                  onVoice={onVoice}
                  initialValue={heard}
                />}
                {!isRecipes && inputMode === "voice" && <NavigationBarVoice
                  onDone={onHeard}
                  onDiscard={() => onBlur()}
                />}
                {isRecipes && <ButtonPill
                  leftIcon={Plus}
                  onPress={() => router.push("/import-recipe")}
                  elevated
                  variant="secondary"
                  size="lg"
                >
                  {t("import_recipe")}
                </ButtonPill>}
                <AnimatePresence>
                  {(isHome && !inputFocused) && <m.View {...sharedTransition(56)}>
                    <ButtonIcon
                      elevated
                      style={{ alignSelf: "auto" }}
                      variant="secondary"
                      onPress={() => router.push("/recipes")}
                      size="lg"
                    >
                      {ForkKnife}
                    </ButtonIcon>
                  </m.View>}
                </AnimatePresence>
              </SafeAreaView>
            </m.View>
          )}
        </AnimatePresence>
      </KeyboardStickyView>
    </>
  );
};

const styles = StyleSheet.create({
  sticky: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  flex: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[16],
  },
  container: {
    paddingBottom: theme.spacing[24],
  },
});
