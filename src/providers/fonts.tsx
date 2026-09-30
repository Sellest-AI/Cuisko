import { useFonts } from "expo-font";
import Nunito750 from "assets/fonts/Nunito-750.ttf";
import { H4_FONT_FAMILY } from "fonts";

/**
 * Registers the H4 face before anything paints, by rendering nothing until it has.
 *
 * **The only module in the app allowed to reference a font file.** `src/global/fonts.ts` holds the
 * name and metrics and no asset — see the comment there for why that separation is load-bearing
 * rather than tidy.
 *
 * **It does not touch the splash screen, on purpose.** `AuthGate` owns it: it holds the splash at
 * startup and hides it once, on the first settled frame. Two owners would race — this provider
 * would drop the splash as soon as the font arrived, usually before auth settles, and a cold start
 * would flash the gate's blank cover between the splash and the first screen.
 *
 * One owner still waits for both, because of where this sits: outermost in `Providers`, with
 * `AuthGate` rendered inside. Until the font is registered nothing below mounts, `AuthGate`
 * included, so its single `hide()` cannot fire before the font is in. The nesting is the AND. Move
 * this provider below `AuthGate` and headings paint in the system font, then reflow.
 */

/** Registered under the name `theme.font.h4` asks for — the same constant, so they cannot drift. */
const ASSETS = { [H4_FONT_FAMILY]: Nunito750 };

export const FontsProvider = ({ children }: { children: React.ReactNode }) => {
  const [loaded, error] = useFonts(ASSETS);

  /**
   * A font that fails to load is not a reason to show nothing forever — and with `AuthGate`
   * mounted below, it would hold the splash forever too. `useFonts` reports the failure and React
   * Native falls back to the system face, so the app renders, just not in the intended type. Only
   * the undecided state blocks.
   */
  if (error && __DEV__) {
    console.warn(`[FontsProvider] could not register ${H4_FONT_FAMILY}`, error);
  }

  if (!loaded && !error) return null;

  return <>{children}</>;
};
