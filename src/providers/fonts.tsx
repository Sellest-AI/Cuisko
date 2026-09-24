import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import UnboundedMedium from "assets/fonts/Unbounded-Medium.ttf";
import { H4_FONT_FAMILY } from "fonts";

/**
 * Registers the H4 face before the app paints, and holds the splash screen until it has.
 *
 * **The only module in the app allowed to reference a font file.** `src/global/fonts.ts` holds the
 * name and metrics and no asset — see the comment there for why that separation is load-bearing
 * rather than tidy.
 *
 * **Why a gate at all.** `expo-font` registers faces at runtime, and `useFonts` resolves after the
 * first render. Without holding the splash, the app paints its headings in the system face and
 * reflows to the real one a frame later — on every cold start, in front of the user.
 */

/**
 * Called at module scope, not in an effect: the splash is already on screen by the time React
 * mounts anything, so an effect asking to keep it would arrive after it had gone.
 *
 * The rejection is caught rather than left floating, and it is genuinely non-fatal — it means the
 * splash had already auto-hidden, which costs a flash of unstyled headings and nothing else. What
 * must not happen is it taking down the app, or being swallowed silently.
 */
SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  if (__DEV__) console.warn("[FontsProvider] splash screen would not stay up", error);
});

/** Registered under the name `theme.font.h4` asks for — the same constant, so they cannot drift. */
const ASSETS = { [H4_FONT_FAMILY]: UnboundedMedium };

export const FontsProvider = ({ children }: { children: React.ReactNode }) => {
  const [loaded, error] = useFonts(ASSETS);

  useEffect(() => {
    if (!loaded && !error) return;

    SplashScreen.hideAsync().catch((cause: unknown) => {
      if (__DEV__) console.warn("[FontsProvider] splash screen would not come down", cause);
    });
  }, [loaded, error]);

  /**
   * A font that fails to load is not a reason to show nothing forever. `useFonts` reports the
   * failure and React Native falls back to the system face on its own, so the app renders — just
   * not in the intended type. Only the undecided state blocks.
   */
  if (error && __DEV__) {
    console.warn(`[FontsProvider] could not register ${H4_FONT_FAMILY}`, error);
  }

  if (!loaded && !error) return null;

  return <>{children}</>;
};
