import { Platform, Pressable, StyleSheet } from "react-native";

import { ButtonIcon } from "@ui/button-icon";
import { ArrowLeft, ForkKnife } from "@ui/icons";
import { theme } from "theme";
import { router, usePathname } from "expo-router";
import { m, AnimatePresence } from "@ui/motion";
import { NAVIGATION_BAR_OFFSET } from "./constants";
import { useRef, useState } from "react";
import { NavigationBarInput } from "./navigation-bar.input";
import { useNavigationBar } from "./hooks";

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
  const path = usePathname();
  const isHome = path.startsWith("/home");
  const isGroceries = path.startsWith("/groceries");
  const isAssistant = path.startsWith("/assistant");
  const isPlanning = path === "/planning";

  const hasNavigationBar = isHome || isGroceries || isAssistant || isPlanning;

  const [inputFocused, setInputFocused] = useState(false);

  const { reset } = useNavigationBar();

  // Kept so focusing again cancels the reset the previous blur scheduled.
  const cancelResetRef = useRef(() => { });
  const onBlur = () => {
    setInputFocused(false);
    cancelResetRef.current = reset({ delayed: true });
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
      <AnimatePresence>
        {hasNavigationBar && (
          <m.View
            style={styles.container}
            {...sharedTransition()}
            transition={{ delay: INITIAL_DELAY }}
          >
            <AnimatePresence>
              {(!isHome && !inputFocused && !isAssistant) &&
                <m.View {...sharedTransition(44)}>
                  <ButtonIcon
                    elevated
                    variant="neutral-inverted"
                    onPress={() => router.canGoBack() ? router.back() : router.dismissTo("/home")}
                    style={{ alignSelf: "auto" }}
                    size="md"
                  >
                    {ArrowLeft}
                  </ButtonIcon>
                </m.View>}
            </AnimatePresence>
            <NavigationBarInput
              focused={inputFocused}
              onFocus={() => { setInputFocused(true); cancelResetRef.current(); }}
              onBlur={() => onBlur()}
            />
            <AnimatePresence>
              {(isHome && !inputFocused) && <m.View {...sharedTransition(56)}>
                <ButtonIcon
                  elevated
                  style={{ alignSelf: "auto" }}
                  variant="secondary"
                  onPress={() => console.log("fork knife pressed")}
                  size="lg"
                >
                  {ForkKnife}
                </ButtonIcon>
              </m.View>}
            </AnimatePresence>
          </m.View>
        )}
      </AnimatePresence>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[16],
    paddingBottom: theme.spacing[24],
  },
});
